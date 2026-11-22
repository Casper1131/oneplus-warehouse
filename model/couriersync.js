const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import database connection
const {encrypt} = require('./encrypt'); // adjust path accordingly
const Courier = require('./courier'); // Import Shipment model (if needed)

const CourierSync = sequelize.define('CourierSync', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    courier_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    synctype: {
      type: DataTypes.STRING, // or use STRING if ENUM is too restrictive
      allowNull: false,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: false,
    }
  
}, {
    tableName: 'courier_syncs',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});
CourierSync.belongsTo(Courier, { foreignKey: 'courier_id',sourceKey: 'courier_id', as: 'courier' });
module.exports = CourierSync;
