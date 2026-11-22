const express = require('express');
const Courier = require('../../model/courier'); // Import the Collection model
const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const CourierSync = require('../../model/couriersync'); // Import the Collection model
const axios = require('axios');
const {encrypt,generateSaltedUuid} = require('../../model/encrypt'); // adjust path accordingly
const Company = require('../../model/company'); // Import the Collection model

async function groupAndSendCouriers(couriers) {
    const groupedByCourier = couriers.reduce((acc, pkg) => {
        const courierId = pkg.courier_id;
        
        if (pkg['courier_id']) {
          pkg['courier_id'] = encrypt(courierId);
          pkg['courier_uuid'] = generateSaltedUuid(courierId.toString());
        }
        if (pkg['company_id']) {
            pkg['company_id'] = encrypt(pkg['company_id']);
        }
        if (!acc[courierId]) {
            acc[courierId] = [];
        }
        acc[courierId].push(pkg);
        return acc;
    }, {});

    for (const [courierId, courierGroup] of Object.entries(groupedByCourier)) {
        const found = await CourierSync.findOne({where: {courier_id: courierId,synctype:"COURIER"},
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
        if (found) {
            const url = found.link;
            try {
                const response = await axios.post(url, {courier: courierGroup[0]});
                console.log(`Sent packages for courier ${courierId}: ${response.status}`);
            } catch (err) {
                console.error(`Error sending packages for courier ${courierId}:`, err.response?.data || err.message);
            }
        }
    }
}


router.post('/courier/sync', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        if (apiKey != "qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie") {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});

        }
        const courier = req.body.courier;
        console.log(courier,req.body);
        await groupAndSendCouriers([courier]);
        res.status(200).json({success: true});

    } catch (error) {
        res.status(500).json({error: error.message});
    }
});
router.get('/courier', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'created_at';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const where = search
            ? {
                  name: { [sequelize.iLike]: `%${search}%` } // Adjust field as needed
              }
            : {};

        const { count, rows } = await Courier.findAndCountAll({
            where,
            limit: perPage,
            offset: (page - 1) * perPage,
            order: [[sortBy, sortDir]],
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
        res.status(500).json({ error: error.message });
    }
});
router.put('/courier/update/:id', async (req, res) => {
    try {
        // Authorization check
        const authHeader = req.headers['authorization'];
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }
        const apiKey = authHeader.replace('Bearer ', '').trim();

        // Find API user and associated courier
        const found = await api.findOne({
            where: { api_key: apiKey },
            include: [
                {
                    model: Courier,
                    as: 'courier',
                    include: [
                        {
                            model: Company,
                            as: 'company',
                            attributes: ['id', 'active', 'isDeleted', 'name']
                        }
                    ]
                }
            ]
        });

        if (!found) return res.status(401).json({ error: 'Invalid API key' });

        const courier = found.courier;
        const company = courier?.company;

        if (!courier || !company || company.isDeleted || company.active === 0) {
            return res.status(401).json({ error: 'Company inactive or deleted' });
        }

        // Extract body values
        const { name, starting_number, last_number, collection_starting_number, collection_last_number } = req.body;

        // Basic validation
        if (!name || !starting_number || !last_number || !collection_starting_number || !collection_last_number) {
            return res.status(422).json({
                error: 'Validation error',
                details: {
                    name: !name ? 'Name is required' : undefined,
                    starting_number: !starting_number ? 'Starting number is required' : undefined,
                    last_number: !last_number ? 'Last number is required' : undefined,
                    collection_starting_number: !collection_starting_number ? 'Collection starting number is required' : undefined,
                    collection_last_number: !collection_last_number ? 'Collection last number is required' : undefined
                }
            });
        }

        const courierId = decrypt(req.params.id);

        // Forward PUT request to Laravel API
        const response = await axios.put(
            `https://warehouse.onepluscourierja.com/api/courier/update/${courierId}`,
            {
                name,
                starting_number,
                last_number,
                collection_starting_number,
                collection_last_number,
                courier_id: courier.courier_id
            },
            {
                headers: {
                    'Accept': 'application/json',
                    Authorization: `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                    'API-KEY': apiKey
                }
            }
        );

        return res.status(response.status).json(response.data);

    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ error: error.message });
    }
});

module.exports = router;
