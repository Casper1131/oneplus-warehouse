/* 
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Other/javascript.js to edit this template
 */

const express = require('express');
const Collection = require('../../model/collection'); // Import the Collection model
const Shipment = require('../../model/shipment'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model
const apilog = require('../../model/apilog'); // Import the Collection model

const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const ratelimiter = require('./ratelimiter'); // Import DB connection
const dataTableQuery = require('./dataTableHelper'); // Import DB connection
const Courier = require('../../model/courier'); // Import the Collection model
const Company = require('../../model/company'); // Import the Collection model

const {Op} = require('sequelize');


router.get('/apilog/table', async (req, res) => {
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
        const columns = ['api_id', 'request_method','request_body','response_body', 'created_at'];

        // Example: Only show logs with method = 'GET' (or use a query param)
        const customWhere = {};
        if (found.api_id) {
            customWhere.api_id = found.api_id;
        }

        const result = await dataTableQuery(apilog, req, columns, customWhere);
        res.json(result);
    } catch (error) {
        console.error('ApiLog DataTable error:', error);
        res.status(500).json({error: 'Failed to load API logs'});
    }
});
module.exports = router;
