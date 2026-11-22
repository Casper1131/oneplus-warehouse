const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import database connection
const {encrypt,generateSaltedUuid} = require('./encrypt'); // adjust path accordingly
const Collection = require('./collection'); // Import the Collection model
const Shipment = require('./shipment'); // Import the Collection model
const User = require('./user'); // Import the Collection model

const Package = sequelize.define('Package', {
    package_id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    tracking_number: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING },
    collection_id: { type: DataTypes.STRING },
    manifest_no: { type: DataTypes.STRING },
    shipping_cost: { type: DataTypes.FLOAT },
    

    shipper: { type: DataTypes.STRING },
    consignee: { type: DataTypes.STRING },
    weight: { type: DataTypes.FLOAT },
    received_date: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING },
    courier_id: { type: DataTypes.INTEGER },
    
    last_synced: { type: DataTypes.DATE },
    created_by: { type: DataTypes.STRING },
    updated_by: { type: DataTypes.STRING },
    
    uuid: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('package_id');
            return id ? generateSaltedUuid(id.toString()) : null;
        }
    }
}, {
    tableName: 'Packages',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});
Package.belongsTo(Collection, { foreignKey: 'collection_id', as: 'collection' });
Package.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Package.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.package_id;
  delete values.collection_id;
  delete values.courier_id;
  delete values.user_id;

  delete values.created_by;
  delete values.updated_by;
  delete values.last_synced;
  return values;
};
module.exports = Package;
