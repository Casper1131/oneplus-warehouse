const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import DB connection
const Shipment = require('./shipment'); // Import Shipment model (if needed)
const {encrypt,generateSaltedUuid} = require('./encrypt'); // adjust path accordingly

const Collection = sequelize.define('Collection', {
    collection_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    courier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    collection_type: {
        type: DataTypes.STRING,
        allowNull: false
    },
    collection_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
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
    uuid: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('collection_id');
            return id ? generateSaltedUuid(id.toString()) : null;
        }
    }
}, {
    tableName: 'Collections',
    timestamps: true, // Enables created_at and updated_at
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});

Collection.prototype.toJSON = function () {
  const values = { ...this.get() };
    if (values.collection_id) {
    values.uuid = generateSaltedUuid(values.collection_id.toString());
  }

  delete values.collection_id;
  return values;
};
// Define Relationships
Collection.belongsTo(Shipment, { foreignKey: 'shipment_id', as: 'shipment' });

module.exports = Collection;
