const express = require('express');
const Collection = require('../../model/collection'); // Import the Collection model
const Shipment = require('../../model/shipment'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model
const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const {Op} = require('sequelize');
const SecureSetting = require('../../model/securesetting'); // Import the Collection model
const Courier = require('../../model/courier'); // Import the Collection model
const Company = require('../../model/company'); // Import the Collection model

const CourierSync = require('../../model/couriersync'); // Import the Collection model
const axios = require('axios');
const {encrypt, generateSaltedUuid} = require('../../model/encrypt'); // adjust path accordingly

async function groupAndSendShipment(couriers) {
    const groupedByCourier = couriers.reduce((acc, pkg) => {
        const courierId = pkg.courier_id;

        if (pkg['courier_id']) {
            pkg['courier_id'] = encrypt(courierId);
        }
        if (pkg['company_id']) {
            pkg['company_id'] = encrypt(pkg['company_id']);
        }
        if (pkg['collection_id']) {
            pkg['collection_id'] = encrypt(pkg['collection_id']);
        }
        if (pkg['shipment_id']) {
            pkg['uuid'] = generateSaltedUuid(pkg['shipment_id']);
            pkg['shipment_id'] = encrypt(pkg['shipment_id']);
        }
        if (!acc[courierId]) {
            acc[courierId] = [];
        }
        acc[courierId].push(pkg);
        return acc;
    }, {});
    console.log('group', groupedByCourier);
    for (const [courierId, shipmentGroup] of Object.entries(groupedByCourier)) {
        console.log('loop');
        const found = await CourierSync.findOne({where: {courier_id: parseInt(courierId.toString()), synctype: "SHIPMENT"},
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
        console.log('loop2');
        const key = await CourierSync.findOne({where: {courier_id: parseInt(courierId.toString()), synctype: "KEY"},
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
        if (found && found.courier &&
                found.courier.company &&
                (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
                ) {

        } else if (found) {
            const url = found.link;
            try {
                const response = await axios.post(url, {shipment: shipmentGroup[0]},
                        {
                            headers: {
                                Accept: 'application/json',
                                Authorization: `Bearer ${key.link}`,
                                'API-KEY': key.link,
                            },
                        });
                console.log(`Sent shipment for courier ${courierId}: ${response.status} ${shipmentGroup[0]} ${url}`);
            } catch (err) {
                console.error(`Error sending packages for courier ${courierId}:`, err.response?.data || err.message);
            }
        }
    }
}


router.post('/shipment/sync', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        if (apiKey != "qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie") {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});

        }
        const shipment = req.body.shipment;
        console.log(shipment, req.body);
        await groupAndSendShipment([shipment]);
        res.status(200).json({success: true});

    } catch (error) {
        res.status(500).json({error: error.message});
    }
});
router.get('/shipment/list', async (req, res) => {
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
        if (found.courier &&
                found.courier.company &&
                (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
                ) {
            return res.status(401).json({error: 'Company inactive or deleted'});

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
                    manifest_no: {[Op.like]: `%${search}%`} // Adjust field as needed
                }
        : {
            courier_id: found.courier_id
        };

        const {count, rows} = await Shipment.findAndCountAll({
            where,
            limit: perPage,
            offset: (page - 1) * perPage,
            order: [[sortBy, sortDir]]
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
