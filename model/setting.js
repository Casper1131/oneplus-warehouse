const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Setting = sequelize.define('Setting', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    courier_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    api_rate_limit: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    auto_sync_interval: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    debug_mode: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    client_role: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    allow_mailbox_duplication: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    allow_trackingnumber_duplication: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
}, {
    tableName: 'Settings',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});

module.exports = Setting;
