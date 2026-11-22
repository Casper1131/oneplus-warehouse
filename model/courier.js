const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import DB connection
const Company = require('./company'); // Import Shipment model (if needed)

const Courier = sequelize.define('Courier', {
    courier_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    starting_number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    last_number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    collection_starting_number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    collection_last_number: {
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
    tableName: 'Couriers',
    timestamps: true, // Enables created_at and updated_at
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});
Courier.belongsTo(Company, { foreignKey: 'company_id',sourceKey: 'id', as: 'company' });

module.exports = Courier;
