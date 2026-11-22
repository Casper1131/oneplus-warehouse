const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Courier = require('./courier'); // Import Shipment model (if needed)


const ApiKey = sequelize.define('ApiKey', {
    api_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    courier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    api_key: {
        type: DataTypes.STRING,
        allowNull: false
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'Api_Keys',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});
ApiKey.hasOne(Courier, { foreignKey: 'courier_id', as: 'courier' });

module.exports = ApiKey;
