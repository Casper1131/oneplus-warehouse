const rateLimitStore = {}; // { apiKey: { count: 0, resetTime: timestamp } }
const Setting = require('../../model/setting'); // Import the Collection model
const api = require('../../model/apikey'); // Import the Collection model

const customRateLimiter = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({error: 'Missing or invalid Authorization header'});
    }

    const apiKey = authHeader.replace('Bearer ', '').trim();

    // Fetch API key details from DB
    const apiKeyRecord = await api.findOne({where: {api_key: apiKey}});
    if (!apiKeyRecord) {
        return res.status(401).json({error: 'Missing or invalid Authorization header'});
    }
    const setti = await Setting.findOne({where: {courier_id: apiKeyRecord.courier_id}});


    const limit = setti?(setti.api_rate_limit || 60):60; // default to 100 if not set
    //const limit = 1;
    const now = Date.now();

    if (!rateLimitStore[apiKey]) {
        rateLimitStore[apiKey] = {
            count: 1,
            resetTime: now + 60 * 60 * 1000 // 1 hour from now
        };
    } else {
        if (now > rateLimitStore[apiKey].resetTime) {
            // reset count and window
            rateLimitStore[apiKey].count = 1;
            rateLimitStore[apiKey].resetTime = now + 60 * 60 * 1000;
        } else {
            rateLimitStore[apiKey].count += 1;
        }
    }

    if (rateLimitStore[apiKey].count > limit) {
        return res.status(429).json({
            error: 'Rate limit exceeded. Try again later.',
            retry_after: new Date(rateLimitStore[apiKey].resetTime).toISOString()
        });
    }

    // Attach API record to request if needed downstream
    req.apiKeyRecord = apiKeyRecord;
    next();
};
module.exports = customRateLimiter;
