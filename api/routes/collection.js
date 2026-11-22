const express = require('express');
const Collection = require('../../model/collection'); // Import the Collection model
const Shipment = require('../../model/shipment'); // Import the Collection model
const Package = require('../../model/package'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model
const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const ratelimiter = require('./ratelimiter'); // Import DB connection
const SecureSetting = require('../../model/securesetting'); // Import the Collection model
const CourierSync = require('../../model/couriersync'); // Import the Collection model

const {Op} = require('sequelize');
const axios = require('axios');
const {encrypt, generateSaltedUuid} = require('../../model/encrypt'); // adjust path accordingly
const Courier = require('../../model/courier'); // Import the Collection model
const Company = require('../../model/company'); // Import the Collection model
const User = require('../../model/user'); // Import the Collection model

async function groupAndSendCollection(couriers) {

    const groupedByCourier = couriers.reduce((acc, pkg) => {
        const courierId = pkg.courier_id;

        if (!acc[courierId]) {
            acc[courierId] = [];
        }

        acc[courierId].push(pkg);
        return acc;
    }, {});

    for (const [courierId, collectionGroup] of Object.entries(groupedByCourier)) {
        console.log('hit', courierId);
        // 🔹 Collection endpoint

        const collectionSync = await CourierSync.findOne({
            where: {courier_id: courierId, synctype: "COLLECTION"},
            include: [
                {
                    model: Courier,
                    as: 'courier', //  Correct alias from CourierSync.belongsTo
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company', // Correct alias from Courier.belongsTo
                            attributes: ['active', 'name']
                        }
                    ]
                }
            ]
        });


        // 🔹 API key
        const key = await CourierSync.findOne({
            where: {courier_id: courierId, synctype: "KEY"},
            include: [
                {
                    model: Courier,
                    as: 'courier', //  Correct alias from CourierSync.belongsTo
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company', // Correct alias from Courier.belongsTo
                            attributes: ['active', 'name']
                        }
                    ]
                }
            ]
        });

        if (!collectionSync)
            continue;

        if (
                collectionSync.courier?.company &&
                (collectionSync.courier.company.isDeleted == 1 ||
                        collectionSync.courier.company.active == 0)
                ) {
            continue;
        }

        const collectionUrl = collectionSync.link;

        for (const collection of collectionGroup) {

            const rawCollectionId = collection.collection_id;
            if (collection.collection_id) {
                collection.uuid = generateSaltedUuid(collection.collection_id);
                collection.collection_id = encrypt(collection.collection_id);
            }

            if (collection.courier_id) {
                collection.courier_id = encrypt(collection.courier_id);
            }

            if (collection.company_id) {
                collection.company_id = encrypt(collection.company_id);
            }
            console.log('collection after encrypt', collection);
            try {
                // 1️⃣ Send Collection
                await axios.post(
                        collectionUrl,
                        {collection: collection},
                        {
                            headers: {
                                Accept: 'application/json',
                                Authorization: `Bearer ${key.link}`,
                                'API-KEY': key ? key.link : '',
                            }
                        }
                );

                console.log(`Collection sent for courier ${courierId}`);


                // 🔹 Fetch collection with shipment
                const collectionRecord = await Collection.findOne({
                    where: {collection_id: rawCollectionId},
                    attributes: [
                        'collection_id',
                        'uuid',
                        'collection_number',
                        'total_weight',
                        'total_packages',
                        'courier_id',
                        'isDeleted',
                        'created_at',
                        'collection_type',
                        'created_by'
                    ],
                    include: [{
                            model: Shipment,
                            as: 'shipment',
                            attributes: [
                                'shipment_id',
                                'manifest_no',
                                'uuid',
                                'origin',
                                'destination',
                                'delivered_date',
                                'isDeleted',
                                'expected_delivery_date',
                                'created_at',
                                'status',
                                'created_by'
                            ]
                        }]
                });

                // 🔹 Fetch packages
                const packages = await Package.findAll({
                    where: {collection_id: rawCollectionId},
                    include: [{
                            model: User,
                            as: 'user',
                            attributes: ['mailbox']
                        }]
                });
// 3️⃣ GROUP packages by courier_id
                const groupedPackages = packages.reduce((acc, pkg) => {
                    const cid = pkg.courier_id;

                    if (!acc[cid]) {
                        acc[cid] = [];
                    }

                    acc[cid].push(pkg);
                    return acc;
                }, {});

// 4️⃣ Send packages per courier in ONE array
                for (const [pkgCourierId, pkgGroup] of Object.entries(groupedPackages)) {

                    const packageSync = await CourierSync.findOne({
                        where: {courier_id: pkgCourierId, synctype: "PACKAGE"},
                        include: [
                            {
                                model: Courier,
                                as: 'courier',
                                attributes: ['name', 'courier_id'],
                                include: [
                                    {
                                        model: Company,
                                        as: 'company',
                                        attributes: ['active', 'name']
                                    }
                                ]
                            }
                        ]
                    });
                    if (!packageSync)
                        continue;

                    const packageKey = await CourierSync.findOne({
                        where: {courier_id: pkgCourierId, synctype: "KEY"}
                    });

                    const packageUrl = packageSync.link;

                    const preparedPackages = [];

                    for (const pkg of pkgGroup) {

                        const data = pkg.get({plain: true});
                        // Attach collection
                        if (collectionRecord) {
                            data.collection = collectionRecord.get({plain: true});
                            delete data.collection.collection_id;
                        }

                        // Encrypt IDs
                        if (data.package_id) {
                            data.uuid = generateSaltedUuid(data.package_id);
                            data.package_id = encrypt(data.package_id);
                        }

                        if (data.collection_id) {
                            data.collection_id = encrypt(data.collection_id);
                        }

                        if (data.courier_id) {
                            data.courier_id = encrypt(data.courier_id);
                        }

                        if (data.company_id) {
                            data.company_id = encrypt(data.company_id);
                        }

                        if (data.user) {
                            data.mailbox = data.user.mailbox;
                            delete data.user;
                        }

                        preparedPackages.push(data);
                    }

                    console.log(`Sending ${preparedPackages.length} packages to courier ${pkgCourierId}`);

                    await axios.post(
                            packageUrl,
                            {packages: preparedPackages}, // ✅ ALL packages in one array
                            {
                                headers: {
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${packageKey?.link}`,
                                    'API-KEY': packageKey ? packageKey.link : ''
                                }
                            }
                    );

                    console.log(`Bulk packages sent for courier ${pkgCourierId}`);
                }

            } catch (err) {
                console.error(
                        `Sync failed for collection ${rawCollectionId}:`,
                        err.response?.data || err.message
                        );
            }
        }
    }
}

async function groupAndSendCollection2(couriers) {

    const groupedByCourier = couriers.reduce((acc, pkg) => {
        const courierId = pkg.courier_id;

        if (!acc[courierId]) {
            acc[courierId] = [];
        }

        acc[courierId].push(pkg);
        return acc;
    }, {});

    for (const [courierId, collectionGroup] of Object.entries(groupedByCourier)) {
        console.log('hit', courierId);
        // 🔹 Collection endpoint

        const collectionSync = await CourierSync.findOne({
            where: {courier_id: courierId, synctype: "COLLECTION"},
            include: [
                {
                    model: Courier,
                    as: 'courier', //  Correct alias from CourierSync.belongsTo
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company', // Correct alias from Courier.belongsTo
                            attributes: ['active', 'name']
                        }
                    ]
                }
            ]
        });


        // 🔹 API key
        const key = await CourierSync.findOne({
            where: {courier_id: courierId, synctype: "KEY"},
            include: [
                {
                    model: Courier,
                    as: 'courier', //  Correct alias from CourierSync.belongsTo
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company', // Correct alias from Courier.belongsTo
                            attributes: ['active', 'name']
                        }
                    ]
                }
            ]
        });

        if (!collectionSync)
            continue;

        if (
                collectionSync.courier?.company &&
                (collectionSync.courier.company.isDeleted == 1 ||
                        collectionSync.courier.company.active == 0)
                ) {
            continue;
        }

        const collectionUrl = collectionSync.link;

        for (const collection of collectionGroup) {

            const rawCollectionId = collection.collection_id;
            if (collection.collection_id) {
                collection.uuid = generateSaltedUuid(collection.collection_id);
                collection.collection_id = encrypt(collection.collection_id);
            }

            if (collection.courier_id) {
                collection.courier_id = encrypt(collection.courier_id);
            }

            if (collection.company_id) {
                collection.company_id = encrypt(collection.company_id);
            }
            console.log('collection after encrypt', collection);
            try {
                // 1️⃣ Send Collection
                await axios.post(
                        collectionUrl,
                        {collection: collection},
                        {
                            headers: {
                                Accept: 'application/json',
                                Authorization: `Bearer ${key.link}`,
                                'API-KEY': key ? key.link : '',
                            }
                        }
                );

                console.log(`Collection sent for courier ${courierId}`);


                // 🔹 Fetch collection with shipment
                const collectionRecord = await Collection.findOne({
                    where: {collection_id: rawCollectionId},
                    attributes: [
                        'collection_id',
                        'uuid',
                        'collection_number',
                        'total_weight',
                        'total_packages',
                        'courier_id',
                        'isDeleted',
                        'created_at',
                        'collection_type',
                        'created_by'
                    ],
                    include: [{
                            model: Shipment,
                            as: 'shipment',
                            attributes: [
                                'shipment_id',
                                'manifest_no',
                                'uuid',
                                'origin',
                                'destination',
                                'delivered_date',
                                'isDeleted',
                                'expected_delivery_date',
                                'created_at',
                                'status',
                                'created_by'
                            ]
                        }]
                });

                // 🔹 Fetch packages
                const packages = await Package.findAll({
                    where: {collection_id: rawCollectionId},
                    include: [{
                            model: User,
                            as: 'user',
                            attributes: ['mailbox']
                        }]
                });

                // 3️⃣ Send packages one by one
                for (const pkg of packages) {


                    const pkgcourierId = pkg.courier_id;
                    const packageSync = await CourierSync.findOne({
                        where: {courier_id: pkgcourierId, synctype: "PACKAGE"},
                        include: [
                            {
                                model: Courier,
                                as: 'courier', //  Correct alias from CourierSync.belongsTo
                                attributes: ['name', 'courier_id'],
                                include: [
                                    {
                                        model: Company,
                                        as: 'company', // Correct alias from Courier.belongsTo
                                        attributes: ['active', 'name']
                                    }
                                ]
                            }
                        ]
                    });
                    const data = pkg.get({plain: true});
                    // attach collection
                    if (collectionRecord) {
                        data.collection = collectionRecord.get({plain: true});
                        delete data.collection.collection_id;
                    }

                    if (data.package_id) {
                        data.uuid = generateSaltedUuid(data.package_id);
                        data.package_id = encrypt(data.package_id);
                    }

                    if (data.collection_id) {
                        data.collection_id = encrypt(data.collection_id);
                    }

                    if (data.courier_id) {
                        data.courier_id = encrypt(data.courier_id);
                    }

                    if (data.company_id) {
                        data.company_id = encrypt(data.company_id);
                    }

                    if (data.user) {
                        data.mailbox = data.user.mailbox;
                        delete data.user;
                    }
                    console.log('package after encrypt', data);
                    const packagekey = await CourierSync.findOne({
                        where: {courier_id: parseInt(pkgcourierId.toString()), synctype: "KEY"},
                        include: [
                            {
                                model: Courier,
                                as: 'courier', //  Correct alias from CourierSync.belongsTo
                                attributes: ['name', 'courier_id'],
                                include: [
                                    {
                                        model: Company,
                                        as: 'company', // Correct alias from Courier.belongsTo
                                        attributes: ['active', 'name']
                                    }
                                ]
                            }
                        ]
                    });
                    const packageUrl = packageSync ? packageSync.link : null;

                    await axios.post(
                            packageUrl,
                            {packages: [data]},
                            {
                                headers: {
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${packagekey.link}`,
                                    'API-KEY': packagekey ? packagekey.link : ''
                                }
                            }
                    );

                    console.log(`Package ${data.uuid} sent for courier ${pkgcourierId}`);
                }

            } catch (err) {
                console.error(
                        `Sync failed for collection ${rawCollectionId}:`,
                        err.response?.data || err.message
                        );
            }
        }
    }
}

router.post('/collection/sync', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        if (apiKey != "qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie") {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});

        }
        const collection = req.body.collection;
        console.log(collection, req.body);
        await groupAndSendCollection(collection);
        res.status(200).json({success: true});

    } catch (error) {
        res.status(500).json({error: error.message});
    }
});
router.get('/collection/list', ratelimiter, async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();

        const found = await api.findOne({where: {api_key: apiKey},
            include: [
                {
                    model: Courier,
                    as: 'courier', //  Correct alias from CourierSync.belongsTo
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company', // Correct alias from Courier.belongsTo
                            attributes: ['active', 'name']
                        }
                    ]
                }
            ]});
        if (found === null) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }
        const setti = await SecureSetting.findOne({where: {courier_id: found.courier_id}});
        if (!setti || !setti.is_premium) {
            return res.status(401).json({error: 'No premium feature available'});
        }
        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 10, 100);
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'created_at';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const where = search
                ? {
                    courier_id: found.courier_id,
                    collection_number: {
                        [Op.like]: `%${search}%`
                    }// Adjust field as needed
                }
        : {
            courier_id: found.courier_id,
            isDeleted: 0
        };

        const {count, rows} = await Collection.findAndCountAll({
            where,
            limit: perPage,
            offset: (page - 1) * perPage,
            order: [[sortBy, sortDir]],
            attributes: ['uuid', 'collection_id', 'collection_number', 'courier_id', 'created_at', 'collection_type'], // Add any other fields you need

            include: [
                {
                    model: Shipment,
                    as: 'shipment',
                    attributes: ['uuid', 'shipment_id', 'manifest_no', 'origin', 'destination', 'delivered_date', 'expected_delivery_date'], // optional: pick only what you need
                }
            ],
        });

        res.json({
            data: rows,
            meta: {
                total: count,
                page,
                perPage,
                totalPages: Math.ceil(count / perPage),
            },
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});
module.exports = router;
