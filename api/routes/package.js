const express = require('express');
const Package = require('../../model/package'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model
const CourierSync = require('../../model/couriersync'); // Import the Collection model
const axios = require('axios');
const {encrypt, generateSaltedUuid} = require('../../model/encrypt'); // adjust path accordingly
const Collection = require('../../model/collection'); // Import the Collection model
const Shipment = require('../../model/shipment'); // Import the Collection model
const User = require('../../model/user'); // Import the Collection model
const Courier = require('../../model/courier'); // Import the Collection model
const Company = require('../../model/company'); // Import the Collection model

const {Op} = require('sequelize');

const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection

/**
 * Groups an array of package objects by courier_id and sends each group to a specified endpoint.
 * @param {Array<Object>} packages - Array of package objects.
 * @param {string} endpointBase - Base URL to post to (e.g. https://your-api.com/couriers).
 */
async function groupAndSendPackages(packages) {
    var ids = {};
    const groupedByCourier = packages.reduce((acc, pkg) => {
        const courierId = pkg.courier_id;
        if (pkg['package_id']) {
            pkg['uuid'] = generateSaltedUuid(pkg['package_id']);
            pkg['package_id'] = encrypt(pkg['package_id']);
        }
        if (pkg['courier_id']) {
            pkg['courier_id'] = encrypt(courierId);
        }
        if (pkg['company_id']) {
            pkg['company_id'] = encrypt(pkg['company_id']);
        }
        if (pkg['user']) {
            pkg['mailbox'] = pkg['user'].mailbox;
            delete pkg['user'];
        }
        if (pkg['collection_id']) {
            var id = pkg['collection_id'];
            ids[pkg['collection_id']] = id;
        }
        if (!acc[courierId]) {
            acc[courierId] = [];
        }
        acc[courierId].push(pkg);
        return acc;
    }, {});
    console.log('groups', groupedByCourier);
    console.log('groups', ids);

    try {
        collections = await Collection.findAll({
            where: {
                collection_id: {
                    [Op.in]: Object.values(ids) // `ids` should be an array of collection IDs
                }
            },
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
            include: [
                {
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
                    ],
                }
            ],
        });

    } catch (error) {
        console.error('Error fetching collections:', error);

    }
    for (const [courierId, packageGroup] of Object.entries(groupedByCourier)) {

        const found = await CourierSync.findOne({where: {courier_id: parseInt(courierId.toString()), synctype: "PACKAGE"}});
        const sendkey = await CourierSync.findOne({where: {courier_id: parseInt(courierId.toString()), synctype: "KEY"}, include: [
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
        if (!sendkey) {
            sendkey = {link: ""};
        }
        console.log('sendkey', sendkey);
        if (found && found.courier &&
                found.courier.company &&
                (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
                ) {

        } else if (found) {
            console.log(collections, Object.values(ids));
            for (let i = 0; i < packageGroup.length; i++) {
                const item = packageGroup[i];

                for (let j = 0; j < collections.length; j++) {
                    const collection = collections[j];

                    if (collection.dataValues.collection_id === ids[item.collection_id]) {
                        // Attach the matched collection
                        item.collection = collection.get({plain: true});
                        delete item.collection.collection_id;
                        break; // Exit inner loop once matched
                    }
                }

                // If no match was found, item.collection will remain undefined
            }
            const url = found.link;
            try {
                const response = await axios.post(url,
                        {packages: packageGroup},
                        {
                            headers: {
                                Authorization: `Bearer ${sendkey.link}`,
                                'API-KEY': sendkey.link
                            }
                        }
                );
                console.log(`Sent packages for courier ${courierId}: ${response.status}`);
            } catch (err) {
                console.error(`Error sending packages for courier ${courierId}:`, err.response?.data || err.message);
            }
        }
    }
}
router.post('/package/sync', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        if (apiKey != "qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie") {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});

        }
        const packages = req.body.packages;
        await groupAndSendPackages(packages);
        res.status(200).json({success: true});

    } catch (error) {
        res.status(500).json({error: error.message});
    }
});
router.get('/package/list', async (req, res) => {
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
        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 10, 100);
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'created_at';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const where = search
                ? {
                    courier_id: found.courier_id,
                    tracking_number: {[Op.like]: `%${search}%`}
                }
        : {
            courier_id: found.courier_id,
            isDeleted: 0
        };

        const {count, rows} = await Package.findAndCountAll({
            where,
            limit: perPage,
            offset: (page - 1) * perPage,
            order: [[sortBy, sortDir]],
            include: [

                {
                    model: User,
                    as: 'user', // ✅ Correct alias from Package.belongsTo
                    attributes: [
                        'mailbox',
                        'branch'
                    ]
                },
                {
                    model: Collection,
                    as: 'collection', // ✅ Correct alias from Package.belongsTo
                    attributes: [
                        'collection_number',
                        'courier_id',
                        'created_at',
                        'collection_type',
                    ],
                    include: [
                        {
                            model: Shipment,
                            as: 'shipment', // ✅ Correct alias from Collection.belongsTo
                            attributes: [
                                'manifest_no',
                                'origin',
                                'destination',
                                'delivered_date',
                                'expected_delivery_date',
                            ],
                        },
                    ],
                },
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
