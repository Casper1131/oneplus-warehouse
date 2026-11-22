const rateLimit = require('express-rate-limit');
const axios = require('axios');
const express = require('express')
const jwt = require('jsonwebtoken');
const SecureSetting = require('./model/securesetting'); // Import the Collection model
const CourierSync = require('./model/couriersync'); // Import the Collection model
const User = require('./model/user'); // Import the Collection model
const api = require('./model/apikey'); // Import the Collection model
const Company = require('./model/company'); // Import the Collection model
const Courier = require('./model/courier'); // Import the Collection model
const PreAlert = require('./model/prealert'); // Import the Collection model

const router = express.Router();
const sequelize = require('./config/database'); // Import DB connection
const {decrypt, encrypt} = require('./model/encrypt'); // adjust path accordingly

//need to run npm install express sequelize mysql2 dotenv body-parser
"use strict";
require('dotenv').config()
const {HeavyList, Resume} = require('./model/heavylist');
const keys = require('./key/master')
const app = express()
const path = require('path');
const session = require('express-session');

const ApiLog = require('./model/apilog'); // Import the Collection model

const bodyParser = require('body-parser')
const port = 3000
var server = app.listen(port);
const shipmentRoutes = require('./api/routes/shipment'); // adjust path

const collectionRoutes = require('./api/routes/collection'); // adjust path
const courierRoutes = require('./api/routes/courier'); // adjust path
const packageRoutes = require('./api/routes/package'); // adjust path
const consigneeRoutes = require('./api/routes/consignee'); // adjust path

const apiRoutes = require('./api/routes/apilog'); // adjust path


app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json({limit: '300mb'}))
app.use(session({
    secret: 'your_secret_key_here', // use a strong secret in production
    resave: false,
    saveUninitialized: false,
    cookie: {secure: false} // set true if using HTTPS
}));

app.use(async (req, res, next) => {
    const url = req.originalUrl || '';

    const logData = {
        request_method: req.method,
        request_url: req.originalUrl,
        request_body: JSON.stringify(req.body || {}),
        timestamp: new Date(),
    };
    const authHeader = req.headers['authorization'] || ''; // get header (case-insensitive)
    const apiKey = authHeader.startsWith('Bearer ')
            ? authHeader.replace('Bearer ', '').trim()
            : null;
    const found = await api.findOne({where: {api_key: apiKey}});
    const oldSend = res.send;

    res.send = async function (data) {
        logData.response_status = res.statusCode;
        logData.response_body = typeof data === 'object' ? JSON.stringify(data) : data;

        // Optional: associate an API key (if available, e.g., from a header or middleware)
        if (found && found.api_id) {
            logData.api_id = found.api_id;
        }

        try {
            if (found && url.includes('api') && !url.includes('log') && !url.includes('login')) {
                await ApiLog.create(logData);

                // 🔽 Delete older logs, keep only the latest 100
                const count = await ApiLog.count({where: {api_id: found.api_id}});

                if (count > 100) {
                    const logsToDelete = await ApiLog.findAll({
                        where: {api_id: found.api_id},
                        order: [['timestamp', 'ASC']], // oldest first
                        limit: count - 100,
                    });

                    const idsToDelete = logsToDelete.map(log => log.log_id);

                    await ApiLog.destroy({where: {log_id: idsToDelete}});
                }
            }
        } catch (err) {
        }

        oldSend.apply(res, arguments);
    };

    next();
});
async function ensureAuthenticated(req, res, next) {
    const token = req.session.jwtToken;
    if (!token) {
        // No token found, redirect to home or login
        return res.redirect('/');
    } else {
        try {
            const decoded = jwt.verify(token, keys.master);
            next();
        } catch (err) {
            return res.redirect('/');

        }
    }
}

app.set('view engine', 'ejs');
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', collectionRoutes);
app.use('/api', courierRoutes);
app.use('/api', packageRoutes);
app.use('/api', consigneeRoutes);
app.use('/api', shipmentRoutes);

app.use('/api', apiRoutes);
app.get('/', (req, res) => {
    res.render('login');
});

app.post('/courier-sync', ensureAuthenticated, async (req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);

    const {synctype, link} = req.body;

    if (!synctype || !link) {
        return res.status(422).json({error: 'Missing fields'});
    }

    try {
        // 1. UPSERT
        await CourierSync.upsert({
            courier_id: decoded.courier_id,
            synctype,
            link
        });

        // 2. IF KEY → STOP HERE
        if (synctype === 'KEY') {
            return res.json({
                message: 'KEY stored successfully'
            });
        }

        // 3. GET STORED KEY
        const keySync = await CourierSync.findOne({
            where: {
                courier_id: decoded.courier_id,
                synctype: 'KEY'
            }
        });

        if (!keySync?.link) {
            return res.status(400).json({
                error: 'KEY not configured for this courier'
            });
        }

        const headers = {
            Authorization: `Bearer ${keySync.link}`,
            'Content-Type': 'application/json'
        };

        let response;

        // 4. CONSIGNEE → NO BODY
        if (synctype === 'CONSIGNEE') {
            response = await axios.get(link, {headers});
        } else {
            // 5. BUILD PAYLOAD BASED ON SYNCTYPE
            let payload = {};

            if (synctype === 'SHIPMENT') {
                payload = {
                    "shipment": [
                        {
                            "uuid": "b064d99b09b70fa23893",
                            "manifest_no": "ewadas2212323",
                            "status": "RECEIVED AT ORIGIN",
                            "origin": "ewadas2212323",
                            "destination": "ewadas2212323",
                            "total_weight": 10,
                            "total_packages": 3,
                            "shipping_cost": 123,
                            "expected_delivery_date": null,
                            "delivered_date": null,
                            "courier_id": "90bf9116e4e3f7bde9a3126eee94fdfc:6572bd36f776d275e9ed7f6ae158fc0d",
                            "updated_at": "2025-06-07T11:13:16.000000Z",
                            "created_at": "2025-06-07T11:13:16.000000Z",
                            "shipment_id": "a064d99b09b70fa238933578ae21705d:150d1b70a14fdb9e1d9d31abdba51d60"
                        }
                    ]
                };
            }

            if (synctype === 'COLLECTION') {
                payload = {
                    "collection": [
                        {
                            "uuid": "c3aa4b812d0a025",
                            "company_id": "8215f8ce67880398e3ddb90a974c6d20:01949dc604decb5b10124c0890cb5643",
                            "courier_id": "5d17582671cbda281d91bec9cbc910a4:ae5b40fdd66009aaa6e1398cfc78f121",
                            "collection_number": "RM62111",
                            "total_weight": 0,
                            "total_packages": 0,
                            "updated_at": "2025-06-07T11:11:04.000000Z",
                            "created_at": "2025-06-07T11:11:04.000000Z",
                            "collection_id": "82e2059b74fe6f534f76e7acc1d5f1c1:e5ad34ade3852610e5a5da36a9b912d2",
                            "shipment": {
                                "shipment_id": "13659742cae82ab09d4447985c0b5701:59e70a6a89626addff0c840f6b9a2c52",
                                "uuid": "23659742cae82ab09d4447",
                                "manifest_no": "kmklklmlklkm",
                                "origin": "4234234234",
                                "destination": "4234234234",
                                "total_weight": 10,
                                "total_packages": 3,
                                "shipping_cost": 123,
                                "delivered_date": "2025-10-08T00:00:00.000Z",
                                "expected_delivery_date": "2025-10-08T00:00:00.000Z",
                                "created_at": "2025-10-08T23:03:28.000Z",
                                "status": "RECEIVED AT ORIGIN",
                                "created_by": 1
                            }
                        }
                    ]
                };
            }

            if (synctype === 'COURIER') {
                payload = {
                    courier: [
                        {
                            name: "Island Express Logistics",
                            code: "IEL",
                            starting_number: 1000,
                            last_number: 1580
                        }
                    ]
                };
            }

            if (synctype === 'PACKAGE') {
                payload = {
                    "packages": [
                        {
                            "package_id": "13659742cae82ab09d4447985c0b5701:59e70a6a89626addff0c840f6b9a2c52",
                            "uuid": "43659742c",
                            "tracking_number": "test008",
                            "description": "Merchandise",
                            "shipper": "OPC",
                            "consignee": "zahira clarke",
                            "weight": 1.60,
                            "received_date": "2025-10-06 00:00:00",
                            "status": "RECEIVED AT ORIGIN",
                            "courier_id": "d8ab2fddd1faa8c591b770a4b6f01471:4aa939e77d203e9204f958c3d2e06f99",
                            "last_synced": "2025-10-07 01:24:12",
                            "created_at": "2025-10-07T01:24:12.000000Z",
                            "updated_at": "2025-10-08T23:46:43.000000Z",
                            "created_by": 1,
                            "updated_by": 1,
                            "company_id": "b750561c0770035db73d9efd2d5d489a:654afbb62d6f887dafd38989ed9d018c",
                            "isDeleted": 0,
                            "insurance_value": null,
                            "shipping_cost": null,
                            "dimensions": null,
                            "origin": null,
                            "collection_id": "bb1e9e6e08125cfc0abe2f90e13a2005:7363776051470ed74cc9b5dc99fb9d00",
                            "destination": null,
                            "manifest_no": "YPE5522",
                            "notes": "RR",
                            "transfered": 0,
                            "mailbox": "YPE-017370",
                            "collection": {
                                "collection_number": "YPE8830",
                                "courier_id": 67,
                                "created_at": "2025-10-08T23:35:43.000Z",
                                "collection_type": "Bag",
                                "created_by": 1,
                                "total_weight": 10,
                                "total_packages": 3,
                                "collection_id": "82e2059b74fe6f534f76e7acc1d5f1c1:e5ad34ade3852610e5a5da36a9b912d2",
                                "shipment": {
                                    "shipment_id": "13659742cae82ab09d4447985c0b5701:59e70a6a89626addff0c840f6b9a2c52",
                                    "uuid": "2ab09d444798",
                                    "manifest_no": "kmklklmlklkm",
                                    "origin": "4234234234",
                                    "destination": "4234234234",
                                    "total_weight": 10,
                                    "total_packages": 3,
                                    "shipping_cost": 123,
                                    "delivered_date": "2025-10-08T00:00:00.000Z",
                                    "expected_delivery_date": "2025-10-08T00:00:00.000Z",
                                    "created_at": "2025-10-08T23:03:28.000Z",
                                    "status": "RECEIVED AT ORIGIN",
                                    "created_by": 1
                                }
                            }
                        }
                    ]
                };
            }

            // 6. SEND BODY
            response = await axios.post(link, payload, {headers});
        }

        // 7. RETURN EXTERNAL RESPONSE
        return res.json({
            message: 'Sync completed successfully',
            data: response.data
        });

    } catch (err) {
        return res.status(500).json({
            error: err.response?.data || err.message
        });
    }
});
app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});

    res.render('dashboard', {setting: setti});
});
app.get('/logs', ensureAuthenticated, async (req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});

    res.render('apilog/list', {setting: setti});
});
app.get('/collection/list', ensureAuthenticated, async (req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});

    res.render('collection/list', {setting: setti});
});
app.get('/shipment/list', ensureAuthenticated, async (req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('shipment/list', {setting: setti});
});
app.get('/package/list', ensureAuthenticated, async (req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('package/list', {setting: setti});
});
app.get('/courier/sync', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    const found = await CourierSync.findOne({where: {courier_id: decoded.courier_id, synctype: "COURIER"}});
    var jsonfound = null;
    if (found) {
        jsonfound = found.toJSON();
    }
    res.render('courier/sync', {setting: setti, hook: jsonfound});
});
app.get('/courier/update', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('courier/update', {setting: setti});
});
app.get('/package/sync', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    const found = await CourierSync.findOne({where: {courier_id: decoded.courier_id, synctype: "PACKAGE"}});
    console.log(setti);
    res.render('package/sync', {setting: setti, hook: found});
});
app.get('/consignee/list', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('consignee/list', {setting: setti});
});
app.get('/consignee/add', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('consignee/add', {setting: setti});
});
app.get('/consignee/update', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('consignee/update', {setting: setti});
});
app.get('/consignee/delete', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});

    res.render('consignee/delete', {setting: setti});
});
app.get('/consignee/sync', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    const found = await CourierSync.findOne({where: {courier_id: decoded.courier_id, synctype: "CONSIGNEE"}});
    var jsonfound = null;
    if (found) {
        jsonfound = found.toJSON();
    }
    console.log(setti);
    res.render('consignee/sync', {setting: setti, hook: jsonfound});
});
app.get('/prealert/add', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('prealert/add', {setting: setti});
});
app.get('/prealert/update', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    console.log(setti);
    res.render('prealert/update', {setting: setti});
});
app.get('/prealert/delete', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});

    res.render('prealert/delete', {setting: setti});
});
app.get('/hook', ensureAuthenticated, async(req, res) => {
    const token = req.session.jwtToken;
    const decoded = jwt.verify(token, keys.master);
    const setti = await SecureSetting.findOne({where: {courier_id: decoded.courier_id}});
    const found = await CourierSync.findAll({where: {courier_id: decoded.courier_id}});
    var jsonfound = null;
    if (found) {
        jsonfound = found.map(function (i) {
            return i.toJSON();
        });
    }
    console.log(setti);
    res.render('hook', {setting: setti, hooks: jsonfound});
});
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Failed to log out.');
        }
        // Optionally clear cookie
        res.clearCookie('connect.sid'); // default session cookie name
        res.redirect('/'); // redirect to home or login page
    });
});

app.post('/login', async (req, res) => {
    const {email, password} = req.body;
    try {
        const response = await axios.post('https://warehouse.onepluscourierja.com/api/login',
                {
                    email: email,
                    password: password
                },
                {
                    headers: {
                        Authorization: `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`
                    }
                }
        );
        const result = response.data[0]; // Laravel is returning an array with a status object inside

        if (result.success === 1) {
            // Create a JWT token with payload you want (e.g., email or userId)
            const payload = {email: email, courier_id: response.data[1]};
            const token = jwt.sign(payload, keys.master, {expiresIn: '24h'});
            req.session.jwtToken = token;

            res.send({token: true, result: result});
        } else {
            res.send({token: false, result: result});
        }

    } catch (error) {
        console.log(error);
        console.error('Login failed:', error.response ? error.response.data : error.message);

        res.send({token: false, error: error});
    }
    // Add your login logic here
});

async function processCourierSyncs() {
    try {
        const courierSyncs = await CourierSync.findAll({where: {synctype: 'CONSIGNEE'}});

        for (const sync of courierSyncs) {
            try {
                const found = await api.findOne({where: {courier_id: sync.courier_id}});
                const sendkey = await CourierSync.findOne({
                    where: {
                        courier_id: sync.courier_id,
                        synctype: "KEY"
                    },
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

                if (!sendkey) {
                    sendkey = {link: ""};
                }
                const res = await await axios.get(sync.link, {
                    headers: {
                        Authorization: `Bearer ${sendkey.link}`,
                        'API-KEY': sendkey.link
                    }
                });
                const consignees = res.data;

                for (const consignee of consignees) {
                    const {first_name, last_name, mailbox, branch, email, active} = consignee;
                    if (!first_name || !last_name || !mailbox) {
                        console.warn('Missing required fields in consignee:', consignee);
                        continue;
                    }

                    try {
                        const response = await axios.post(
                                'https://warehouse.onepluscourierja.com/api/consignee/add',
                                {
                                    first_name,
                                    last_name,
                                    mailbox,
                                    branch,
                                    email,
                                    active,
                                    courier_id: sync.courier_id,
                                },
                                {
                                    headers: {
                                        Accept: 'application/json',
                                        Authorization: `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                                        'API-KEY': found.api_key,
                                    },
                                }
                        );
                        console.error('Sent Consignee');

                    } catch (postErr) {
                        if (postErr.response) {
                            console.error('POST error:', postErr.response.data);
                        } else {
                            console.error('POST failure:', postErr.message);
                        }
                    }
                }
            } catch (fetchErr) {
                console.error(`Error fetching from ${sync.link}:`, fetchErr.message);
            }
        }
    } catch (err) {
        console.error('Database fetch error:', err.message);
    }

    // Re-run only after completion
    setTimeout(processCourierSyncs, 10000);
}
async function processPreAlertSyncs() {
    try {
        // Fetch all PREALERT sync configurations
        const preAlertSyncs = await CourierSync.findAll({
            where: {synctype: 'PREALERT'}
        });

        for (const sync of preAlertSyncs) {
            try {
                // Get the API key for this courier
                const apiKeyRecord = await api.findOne({
                    where: {courier_id: sync.courier_id}
                });
                // Get the KEY sync configuration for authorization
                const keySync = await CourierSync.findOne({
                    where: {
                        courier_id: sync.courier_id,
                        synctype: "KEY"
                    },
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

                const authKey = keySync ? keySync.link : "";

                // Fetch pre-alerts from the external system
                const response = await axios.get(sync.link, {
                    headers: {
                        'Authorization': `Bearer ${authKey}`,
                        'API-KEY': authKey,
                        'Accept': 'application/json'
                    }
                });

                const preAlerts = response.data;

                // Process each pre-alert
                for (const preAlert of preAlerts) {
                    const {
                        tracking_no,
                        merchant,
                        shipper,
                        consignee,
                        description,
                        weight,
                        dimensions,
                        value,
                        package_type,
                        destination,
                        expected_arrival,
                        status,
                        match_score,
                        match_level,
                        courier_code
                    } = preAlert;
                    // Validate required fields
                    if (!tracking_no) {
                        console.warn('Missing required tracking number in pre-alert:', preAlert);
                        continue;
                    }

                    try {
                        // Prepare the payload
                        const payload = {
                            tracking_no,
                            courier_id: sync.courier_id,
                            merchant: merchant || null,
                            shipper: shipper || null,
                            consignee: consignee || null,
                            description: description || null,
                            weight: weight ? parseFloat(weight) : null,
                            dimensions: dimensions || null,
                            value: value ? parseFloat(value) : null,
                            package_type: package_type || null,
                            destination: destination || null,
                            expected_arrival: expected_arrival || null,
                            status: status || 'pending',
                            match_score: match_score || null,
                            match_level: match_level || null,
                            courier_code: courier_code || null
                        };

                        // Send to the warehouse system
                        const response = await axios.post(
                                'https://warehouse.onepluscourierja.com/api/prealert/add',
                                payload,
                                {
                                    headers: {
                                        'Accept': 'application/json',
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                                        'API-KEY': apiKeyRecord ? apiKeyRecord.api_key : ''
                                    }
                                }
                        );

                        // Check for match results
                        if (response.data && response.data.match_score) {
                            console.log(`PreAlert ${tracking_no} matched with score ${response.data.match_score}%`);

                            // Optionally update local database with match info
                            await PreAlert.update(
                                    {
                                        match_score: response.data.match_score,
                                        matched_package_id: response.data.matched_package_id,
                                        matched_at: response.data.matched_at,
                                        match_level: response.data.match_level,
                                        status: 'matched'
                                    },
                                    {
                                        where: {tracking_no: tracking_no, courier_id: sync.courier_id}
                                    }
                            );
                        }

                    } catch (postErr) {
                        if (postErr.response) {
                            console.error(`Error posting pre-alert ${tracking_no}:`, postErr.response.data);

                            // Update status to failed if there's an error
                            try {
                                await PreAlert.update(
                                        {status: 'failed'},
                                        {where: {tracking_no: tracking_no, courier_id: sync.courier_id}}
                                );
                            } catch (updateErr) {
                                console.error('Failed to update pre-alert status:', updateErr.message);
                            }
                        } else {
                            console.error(`POST failure for ${tracking_no}:`, postErr.message);
                        }
                    }
                }

            } catch (fetchErr) {
                console.error(`Error fetching pre-alerts from ${sync.link}:`, fetchErr.message);
                if (fetchErr.response) {
                    console.error('Response data:', fetchErr.response.data);
                }
            }
        }
    } catch (err) {
        console.error('Database fetch error for PREALERT syncs:', err.message);
    }

    // Re-run after completion
    setTimeout(processPreAlertSyncs, 10000);
}

// Batch processing version for handling multiple pre-alerts at once
async function processBatchPreAlertSyncs() {
    try {
        const preAlertSyncs = await CourierSync.findAll({
            where: {synctype: 'PREALERT'}
        });

        for (const sync of preAlertSyncs) {
            try {
                const apiKeyRecord = await api.findOne({
                    where: {courier_id: sync.courier_id}
                });
                const keySync = await CourierSync.findOne({
                    where: {
                        courier_id: sync.courier_id,
                        synctype: "KEY"
                    }
                });

                const authKey = keySync ? keySync.link : "";

                // Fetch pre-alerts from external system
                const response = await axios.get(sync.link, {
                    headers: {
                        'Authorization': `Bearer ${authKey}`,
                        'API-KEY': authKey,
                        'Accept': 'application/json'
                    }
                });

                const preAlerts = response.data;

                if (!preAlerts || preAlerts.length === 0) {
                    console.log('No pre-alerts to sync');
                    continue;
                }

                // Filter valid pre-alerts
                const validPreAlerts = preAlerts.filter(preAlert => preAlert.tracking_no);

                if (validPreAlerts.length === 0) {
                    console.warn('No valid pre-alerts with tracking numbers');
                    continue;
                }

                // Send batch to warehouse system
                try {
                    for (const preAlert of validPreAlerts) {
                        try {
                            const response = await axios.post(
                                    'https://warehouse.onepluscourierja.com/api/prealert/sync',
                                    {
                                        pre_alert: preAlert, // send one at a time
                                        courier_id: sync.courier_id
                                    },
                                    {
                                        headers: {
                                            'Accept': 'application/json',
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`,
                                            'API-KEY': apiKeyRecord ? apiKeyRecord.api_key : ''
                                        }
                                    }
                            );
                            console.log(`Synced pre-alert: ${preAlert.tracking_no}`);

                            // Update sync status
                            try {
                                await PreAlert.update(
                                        {
                                            last_synced: new Date(),
                                            status: 'synced'
                                        },
                                        {
                                            where: {
                                                tracking_no: preAlert.tracking_no,
                                                courier_id: sync.courier_id
                                            }
                                        }
                                );
                            } catch (updateErr) {
                                console.error(`Failed to update pre-alert ${preAlert.tracking_no}:`, updateErr.message);
                            }

                        } catch (err) {
                            console.error(`Sync error for ${preAlert.tracking_no}:`, err.message);
                            if (err.response) {
                                console.error('Response:', err.response.data);
                            }
                        }

                        // ⏱️ 1 second delay between each request
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    console.log(`Finished syncing ${validPreAlerts.length} pre-alerts`);

                } catch (outerErr) {
                    console.error('Unexpected error:', outerErr.message);
                }

            } catch (fetchErr) {
                console.error(`Error fetching pre-alerts from ${sync.link}:`, fetchErr.message);
            }
        }
    } catch (err) {
        console.error('Database fetch error for PREALERT batch syncs:', err.message);
    }

    // Re-run after completion
    setTimeout(processBatchPreAlertSyncs, 10000);
}

// Individual pre-alert sync with retry logic
async function syncPreAlertWithRetry(preAlert, maxRetries = 3) {
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await axios.post(
                    'https://warehouse.onepluscourierja.com/api/prealert/add',
                    preAlert,
                    {
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer qszqihdhtnkfbmgzocwuztfllzcfqlrkbdlsrskoxheuvaloplpmytahpmeidymrydinkmufnhoqfifvkenneguwsvzdxjcotwukrvbhaffeaivaoslilefgtgcfbghmqgxjie`
                        }
                    }
            );

            // Update with match information
            if (response.data && response.data.match_score) {
                await PreAlert.update(
                        {
                            match_score: response.data.match_score,
                            matched_package_id: response.data.matched_package_id,
                            matched_at: response.data.matched_at,
                            match_level: response.data.match_level,
                            status: 'matched',
                            last_synced: new Date()
                        },
                        {
                            where: {tracking_no: preAlert.tracking_no, courier_id: preAlert.courier_id}
                        }
                );
            } else {
                await PreAlert.update(
                        {
                            status: 'synced',
                            last_synced: new Date()
                        },
                        {
                            where: {tracking_no: preAlert.tracking_no, courier_id: preAlert.courier_id}
                        }
                );
            }

            console.log(`Successfully synced pre-alert ${preAlert.tracking_no}`);
            return true;

        } catch (error) {
            attempt++;
            console.error(`Attempt ${attempt} failed for pre-alert ${preAlert.tracking_no}:`, error.message);

            if (attempt === maxRetries) {
                // Mark as failed after max retries
                await PreAlert.update(
                        {
                            status: 'failed',
                            last_synced: new Date()
                        },
                        {
                            where: {tracking_no: preAlert.tracking_no, courier_id: preAlert.courier_id}
                        }
                );
                return false;
            }

            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
}
}

// Start the sync processes
function startPreAlertSyncs() {
    console.log('Starting PreAlert sync processes...');

    // Start individual processing (for real-time updates)
    processPreAlertSyncs();

    // Start batch processing (for bulk updates)
    setTimeout(() => {
        processBatchPreAlertSyncs();
    }, 5000);
}
startPreAlertSyncs();
processCourierSyncs();
