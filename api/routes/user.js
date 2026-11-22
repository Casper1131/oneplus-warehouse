const express = require('express');
const User = require('../../model/user'); // Import the Collection model
const Shipment = require('../../model/shipment'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model
const router = express.Router();
const sequelize = require('../../config/database'); // Import DB connection
const ratelimiter = require('./ratelimiter'); // Import DB connection

const {Op} = require('sequelize');

router.get('/user/list', ratelimiter, async (req, res) => {
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
        const perPage = parseInt(req.query.perPage) || 10;
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'created_at';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const where = search
                ? {
                    courier_id: found.courier_id,
                    consignee: 1,
                    collection_number: {[Op.like]: `%${search}%`} // Adjust field as needed
                }
        : {
            consignee: 1,
            courier_id: found.courier_id
        };

        const {count, rows} = await User.findAndCountAll({
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
