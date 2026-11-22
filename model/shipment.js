const {DataTypes} = require('sequelize');
const sequelize = require('../config/database'); // Your DB connection
const Collection = require('./collection'); // Import the related model
const {encrypt,generateSaltedUuid} = require('./encrypt'); // adjust path accordingly


const Shipment = sequelize.define('Shipment', {
    shipment_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    courier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    manifest_no: {
        type: DataTypes.STRING,
        allowNull: true
    },
    origin: {
        type: DataTypes.STRING,
        allowNull: true
    },
    destination: {
        type: DataTypes.STRING,
        allowNull: true
    },
    total_weight: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    total_packages: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    shipping_cost: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    expected_delivery_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    delivered_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    last_synced: {
        type: DataTypes.DATE,
        allowNull: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    isDeleted: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    encrypted_id: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('shipment_id');
            return id ? encrypt(id.toString()) : null;
        }
    },
    uuid: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('shipment_id');
            return id ? generateSaltedUuid(id.toString()) : null;
        }
    }
}, {
    tableName: 'Shipments',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});

Shipment.prototype.toJSON = function () {
  const values = { ...this.get() };
  if (values.shipment_id) {
    values.uuid = generateSaltedUuid(values.shipment_id.toString());
  }
  delete values.shipment_id;
  delete values.courier_id;
  return values;
};
module.exports = Shipment;
