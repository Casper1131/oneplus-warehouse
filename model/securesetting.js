const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SecuritySetting = sequelize.define('SecuritySetting', {
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
    login_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    cut_off_time: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    password_expiry_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    multi_factor_auth: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    session_timeout_minutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    ip_restrictions: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    failed_login_attempts: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    account_lock_duration_minutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    security_question_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    auto_logout: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    is_premium: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
}, {
    tableName: 'SecurityConfig',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});

module.exports = SecuritySetting;
