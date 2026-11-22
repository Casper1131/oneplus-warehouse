const express = require('express');
const router = express.Router();
const {CourierSync} = require('../models'); // adjust path if needed

router.post('/sync/store', async (req, res) => {
    try {
        const {synctype, link} = req.body;

        // Validation
        const errors = {};
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();

        const found = await api.findOne({where: {api_key: apiKey}});
        if (found === null) {
            return res.status(401).json({error: 'Missing or invalid Authorization header'});
        }
        if (!link)
            errors.link = 'Link is required';

        if (Object.keys(errors).length > 0) {
            return res.status(422).json({error: 'Validation failed', details: errors});
        }

        // Save to DB
        const newSync = await CourierSync.create({
            found.courier_id,
            synctype,
            link
        });

        return res.status(201).json({message: 'Courier sync record created', data: newSync});

    } catch (error) {
        return res.status(500).json({error: error.message});
    }
});
