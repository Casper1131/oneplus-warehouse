const express = require('express');
const User = require('../../model/user'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model
const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const {decrypt, encrypt, generateSaltedUuid} = require('../../model/encrypt'); // adjust path accordingly
const axios = require('axios');
const {Op} = require('sequelize');
const Courier = require('../../model/courier'); // Import the Collection model
const Company = require('../../model/company'); // Import the Collection model

router.get('/consignee/list', async (req, res) => {
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
        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 10, 100);
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'created_at';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const where = search
                ? {
                    courier_id: found.courier_id,
                    mailbox: {
                        [Op.like]: `%${search}%`
                    },
                    consignee: 1,
                    isDeleted: 0// Adjust field as needed
                }
        : {
            courier_id: found.courier_id,
            consignee: 1,
            isDeleted: 0
        };
        const {count, rows} = await User.findAndCountAll({
            where,
            limit: perPage,
            offset: (page - 1) * perPage,
            order: [[sortBy, sortDir]],
            attributes: ['id', 'uuid', 'encrypted_id', 'name', 'first_name', 'last_name', 'mailbox', 'branch', 'created_at', 'updated_at']
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
router.post('/consignee/add', async (req, res) => {
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
        if (!found) {
            return res.status(401).json({error: 'Invalid API key'});
        }

        if (found.courier &&
                found.courier.company &&
                (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
                ) {
            return res.status(401).json({error: 'Company inactive or deleted'});

        }

        const {first_name, last_name, mailbox, branch, email} = req.body;
        if (!first_name || !last_name || !mailbox) {
            return res.status(422).json({
                error: 'Validation error',
                details: {
                    first_name: !first_name ? 'First name is required' : undefined,
                    last_name: !last_name ? 'Last name is required' : undefined,
                    mailbox: !mailbox ? 'Mailbox is required' : undefined,
                },
            });
        }

        // Forward data to Laravel endpoint
        const response = await axios.post('https://warehouse.onepluscourierja.com/api/consignee/add', {
            first_name,
            last_name,
            mailbox,
            branch,
            email,
            courier_id: found.courier_id
        }, {
            headers: {
                'Accept': 'application/json',
                Authorization: `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                'API-KEY': `${apiKey}`, // Optional if Laravel expects it
            }
        });
        response.data[0]['id'] = generateSaltedUuid(response.data[0]['id']);
        return res.status(response.status).json(response.data);
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        return res.status(500).json({error: error.message});
    }
});

router.put('/consignee/update/:id', async (req, res) => {
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

        if (!found) {
            return res.status(401).json({error: 'Invalid API key'});
        }

        if (found.courier &&
                found.courier.company &&
                (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
                ) {
            return res.status(401).json({error: 'Company inactive or deleted'});

        }

        const {first_name, last_name, mailbox, branch, email} = req.body;

        // Validation
        if (!first_name || !last_name || !mailbox) {
            return res.status(422).json({
                error: 'Validation error',
                details: {
                    first_name: !first_name ? 'First name is required' : undefined,
                    last_name: !last_name ? 'Last name is required' : undefined,
                    mailbox: !mailbox ? 'Mailbox is required' : undefined,
                },
            });
        }

        const {id} = req.params;

        // Forward the PUT request to Laravel
        const response = await axios.put(`https://warehouse.onepluscourierja.com/api/consignee/update/${decrypt(id)}`, {
            first_name,
            last_name,
            mailbox,
            branch,
            email,
            courier_id: found.courier_id
        }, {
            headers: {
                'Accept': 'application/json',
                Authorization: `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                'API-KEY': `${apiKey}`, // Optional if Laravel expects it
            }
        });

        return res.status(response.status).json(response.data);

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        console.log(error);
        return res.status(500).json({error: error.message});
    }
});
router.delete('/consignee/delete/:id', async (req, res) => {
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
        if (!found) {
            return res.status(401).json({error: 'Invalid API key'});
        }

        if (found.courier &&
                found.courier.company &&
                (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
                ) {
            return res.status(401).json({error: 'Company inactive or deleted'});

        }

        const {id} = req.params;

        // Forward DELETE request to Laravel
        const response = await axios.delete(`https://warehouse.onepluscourierja.com/api/consignee/delete/${decrypt(id)}`, {
            headers: {
                'Accept': 'application/json',
                Authorization: `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                'API-KEY': `${apiKey}`, // Optional if Laravel expects it
            }
        });

        return res.status(response.status).json(response.data);

    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        return res.status(500).json({error: error.message});
    }
});

module.exports = router;
