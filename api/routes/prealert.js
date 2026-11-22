const express = require('express');
const User = require('../../model/user'); // Import the User model
const PreAlert = require('../../model/prealert'); // Import the PreAlert model
const api = require('../../model/apikey'); // Import the API key model
const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const { decrypt, encrypt, generateSaltedUuid } = require('../../model/encrypt'); // adjust path accordingly
const axios = require('axios');
const { Op } = require('sequelize');
const Courier = require('../../model/courier'); // Import the Courier model
const Company = require('../../model/company'); // Import the Company model

// Helper function to group and send pre-alerts (similar to groupAndSendPackages)

// GET /prealert/list - List pre-alerts with pagination
router.get('/prealert/list', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        const found = await api.findOne({
            where: { api_key: apiKey },
            include: [
                {
                    model: Courier,
                    as: 'courier',
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company',
                            attributes: ['active', 'name', 'isDeleted']
                        }
                    ]
                }
            ]
        });

        if (found === null) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (found.courier &&
            found.courier.company &&
            (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
        ) {
            return res.status(401).json({ error: 'Company inactive or deleted' });
        }

        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 10, 100);
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'created_at';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const status = req.query.status || '';
        
        let where = {
            courier_id: found.courier_id
        };
        
        if (search) {
            where[Op.or] = [
                { tracking_no: { [Op.like]: `%${search}%` } },
                { consignee: { [Op.like]: `%${search}%` } },
                { merchant: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }
        
        if (status) {
            where.status = status;
        }

        const { count, rows } = await PreAlert.findAndCountAll({
            where,
            limit: perPage,
            offset: (page - 1) * perPage,
            order: [[sortBy, sortDir]],
            attributes: { exclude: ['id'] } // Exclude internal id
        });

        // Add UUID to each record
        const dataWithUuid = rows.map(row => {
            const plainRow = row.toJSON();
            plainRow.uuid = generateSaltedUuid(row.id.toString());
            return plainRow;
        });

        res.json({
            data: dataWithUuid,
            meta: {
                total: count,
                page,
                perPage,
                totalPages: Math.ceil(count / perPage),
            },
        });
    } catch (error) {
        console.error('Error in GET /prealert/list:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /prealert/add - Add a new pre-alert
router.post('/prealert/add', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        const found = await api.findOne({
            where: { api_key: apiKey },
            include: [
                {
                    model: Courier,
                    as: 'courier',
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company',
                            attributes: ['active', 'name', 'isDeleted']
                        }
                    ]
                }
            ]
        });

        if (!found) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (found.courier &&
            found.courier.company &&
            (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
        ) {
            return res.status(401).json({ error: 'Company inactive or deleted' });
        }

        const {
            tracking_no,
            description,
            merchant,
            shipper,
            consignee,
            weight,
            dimensions,
            value,
            destination,
            expected_arrival,
            package_type,
            courier_code
        } = req.body;

        // Validation
        if (!tracking_no) {
            return res.status(422).json({
                error: 'Validation error',
                details: {
                    tracking_no: 'Tracking number is required'
                }
            });
        }

        // Check if tracking number already exists
        const existing = await PreAlert.findOne({
            where: {
                tracking_no: tracking_no,
                courier_id: found.courier_id
            }
        });

        if (existing) {
            return res.status(409).json({
                error: 'Duplicate pre-alert',
                message: 'A pre-alert with this tracking number already exists'
            });
        }

        // Create pre-alert in local database
        const preAlert = await PreAlert.create({
            tracking_no,
            description,
            merchant,
            shipper,
            consignee,
            weight,
            dimensions,
            value,
            destination,
            expected_arrival,
            package_type,
            courier_code,
            courier_id: found.courier_id,
            company_id: found.courier.company?.id || null,
            status: 'pending',
            created_by: 'api',
            updated_by: 'api',
            created_at: new Date(),
            updated_at: new Date()
        });

        // Forward to Laravel endpoint
        try {
            const response = await axios.post('https://warehouse.onepluscourierja.com/api/prealert/add', {
                ...req.body,
                courier_id: found.courier_id,
                local_id: preAlert.id
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            // Update with matched data from Laravel
            if (response.data && response.data.match_score) {
                await preAlert.update({
                    match_score: response.data.match_score,
                    matched_package_id: response.data.matched_package_id,
                    matched_at: response.data.matched_at,
                    match_level: response.data.match_level
                });
            }

            const responseData = {
                ...preAlert.toJSON(),
                uuid: generateSaltedUuid(preAlert.id.toString()),
                external_response: response.data
            };

            return res.status(response.status).json(responseData);
        } catch (axiosError) {
            // If Laravel fails, still return the local pre-alert
            return res.status(201).json({
                ...preAlert.toJSON(),
                uuid: generateSaltedUuid(preAlert.id.toString()),
                warning: 'Created locally but sync with external system failed'
            });
        }

    } catch (error) {
        console.error('Error in POST /prealert/add:', error);
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: error.message });
    }
});

// PUT /prealert/update/:id - Update an existing pre-alert
router.put('/prealert/update/:id', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        const found = await api.findOne({
            where: { api_key: apiKey },
            include: [
                {
                    model: Courier,
                    as: 'courier',
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company',
                            attributes: ['active', 'name', 'isDeleted']
                        }
                    ]
                }
            ]
        });

        if (!found) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (found.courier &&
            found.courier.company &&
            (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
        ) {
            return res.status(401).json({ error: 'Company inactive or deleted' });
        }

        const { id } = req.params;
        const decryptedId = decrypt(id);
        
        // Find the pre-alert
        const preAlert = await PreAlert.findOne({
            where: {
                id: decryptedId,
                courier_id: found.courier_id
            }
        });

        if (!preAlert) {
            return res.status(404).json({ error: 'Pre-alert not found' });
        }

        const {
            tracking_no,
            description,
            merchant,
            shipper,
            consignee,
            weight,
            dimensions,
            value,
            destination,
            expected_arrival,
            package_type,
            status
        } = req.body;

        // Update local record
        await preAlert.update({
            tracking_no: tracking_no || preAlert.tracking_no,
            description: description !== undefined ? description : preAlert.description,
            merchant: merchant !== undefined ? merchant : preAlert.merchant,
            shipper: shipper !== undefined ? shipper : preAlert.shipper,
            consignee: consignee !== undefined ? consignee : preAlert.consignee,
            weight: weight !== undefined ? weight : preAlert.weight,
            dimensions: dimensions !== undefined ? dimensions : preAlert.dimensions,
            value: value !== undefined ? value : preAlert.value,
            destination: destination !== undefined ? destination : preAlert.destination,
            expected_arrival: expected_arrival !== undefined ? expected_arrival : preAlert.expected_arrival,
            package_type: package_type !== undefined ? package_type : preAlert.package_type,
            status: status || preAlert.status,
            updated_by: 'api',
            updated_at: new Date()
        });

        // Forward to Laravel endpoint
        try {
            const response = await axios.put(`https://warehouse.onepluscourierja.com/api/prealert/update/${preAlert.id}`, {
                ...req.body,
                courier_id: found.courier_id
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const responseData = {
                ...preAlert.toJSON(),
                uuid: generateSaltedUuid(preAlert.id.toString()),
                external_response: response.data
            };

            return res.status(response.status).json(responseData);
        } catch (axiosError) {
            // Return local update even if external sync fails
            return res.status(200).json({
                ...preAlert.toJSON(),
                uuid: generateSaltedUuid(preAlert.id.toString()),
                warning: 'Updated locally but sync with external system failed'
            });
        }

    } catch (error) {
        console.error('Error in PUT /prealert/update/:id:', error);
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: error.message });
    }
});

// DELETE /prealert/delete/:id - Delete a pre-alert
router.delete('/prealert/delete/:id', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        const found = await api.findOne({
            where: { api_key: apiKey },
            include: [
                {
                    model: Courier,
                    as: 'courier',
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company',
                            attributes: ['active', 'name', 'isDeleted']
                        }
                    ]
                }
            ]
        });

        if (!found) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (found.courier &&
            found.courier.company &&
            (found.courier.company.isDeleted == 1 || found.courier.company.active == 0)
        ) {
            return res.status(401).json({ error: 'Company inactive or deleted' });
        }

        const { id } = req.params;
        const decryptedId = decrypt(id);
        
        // Find the pre-alert
        const preAlert = await PreAlert.findOne({
            where: {
                id: decryptedId,
                courier_id: found.courier_id
            }
        });

        if (!preAlert) {
            return res.status(404).json({ error: 'Pre-alert not found' });
        }

        // Forward DELETE to Laravel
        try {
            const response = await axios.delete(`https://warehouse.onepluscourierja.com/api/prealert/delete/${preAlert.id}`, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            // Delete local record after successful external deletion
            await preAlert.destroy();

            return res.status(response.status).json(response.data);
        } catch (axiosError) {
            // If external deletion fails, don't delete locally
            if (axiosError.response) {
                return res.status(axiosError.response.status).json(axiosError.response.data);
            }
            throw axiosError;
        }

    } catch (error) {
        console.error('Error in DELETE /prealert/delete/:id:', error);
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ error: error.message });
    }
});


// POST /prealert/bulk - Bulk create pre-alerts
router.post('/prealert/bulk', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        const found = await api.findOne({
            where: { api_key: apiKey },
            include: [
                {
                    model: Courier,
                    as: 'courier',
                    attributes: ['name', 'courier_id'],
                    include: [
                        {
                            model: Company,
                            as: 'company',
                            attributes: ['active', 'name', 'isDeleted']
                        }
                    ]
                }
            ]
        });

        if (!found) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const { pre_alerts } = req.body;
        
        if (!pre_alerts || !Array.isArray(pre_alerts) || pre_alerts.length === 0) {
            return res.status(422).json({ error: 'pre_alerts array is required' });
        }

        const createdPreAlerts = [];
        const errors = [];

        for (const alert of pre_alerts) {
            try {
                // Check for duplicates
                const existing = await PreAlert.findOne({
                    where: {
                        tracking_no: alert.tracking_no,
                        courier_id: found.courier_id
                    }
                });

                if (existing) {
                    errors.push({
                        tracking_no: alert.tracking_no,
                        error: 'Duplicate tracking number'
                    });
                    continue;
                }

                const created = await PreAlert.create({
                    tracking_no: alert.tracking_no,
                    description: alert.description,
                    merchant: alert.merchant,
                    shipper: alert.shipper,
                    consignee: alert.consignee,
                    weight: alert.weight,
                    dimensions: alert.dimensions,
                    value: alert.value,
                    destination: alert.destination,
                    expected_arrival: alert.expected_arrival,
                    package_type: alert.package_type,
                    courier_code: alert.courier_code,
                    courier_id: found.courier_id,
                    company_id: found.courier.company?.id || null,
                    status: 'pending',
                    created_by: 'api',
                    updated_by: 'api',
                    created_at: new Date(),
                    updated_at: new Date()
                });

                createdPreAlerts.push({
                    ...created.toJSON(),
                    uuid: generateSaltedUuid(created.id.toString())
                });
            } catch (error) {
                errors.push({
                    tracking_no: alert.tracking_no,
                    error: error.message
                });
            }
        }

        res.status(201).json({
            success: true,
            created: createdPreAlerts.length,
            errors: errors.length > 0 ? errors : undefined,
            data: createdPreAlerts
        });

    } catch (error) {
        console.error('Error in POST /prealert/bulk:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;