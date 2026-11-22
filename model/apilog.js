const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Optional: import related model
const ApiKey = require('./apikey');

const ApiLog = sequelize.define('ApiLog', {
    log_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    api_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    request_method: {
        type: DataTypes.STRING,
        allowNull: true
    },
    request_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    response_status: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    response_body: {
        type: DataTypes.STRING,
        allowNull: true
    },
    request_body: {
        type: DataTypes.STRING,
        allowNull: true
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'Api_Logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

// Define relationship
ApiLog.belongsTo(ApiKey, {
    foreignKey: 'api_id',
    as: 'api_key'
});

module.exports = ApiLog;
