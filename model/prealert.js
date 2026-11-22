const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Import database connection
const { encrypt, generateSaltedUuid } = require('./encrypt'); // adjust path accordingly
const User = require('./user'); // Import the User model

const PreAlert = sequelize.define('PreAlert', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    match_score: { type: DataTypes.FLOAT },
    matched_package_id: { type: DataTypes.INTEGER },
    matched_at: { type: DataTypes.DATE },
    match_level: { type: DataTypes.STRING },
    courier_code: { type: DataTypes.STRING },
    consignee: { type: DataTypes.STRING },
    courier_id: { type: DataTypes.INTEGER },
    company_id: { type: DataTypes.INTEGER },
    tracking_no: { type: DataTypes.STRING },
    package_type: { type: DataTypes.STRING },
    merchant: { type: DataTypes.STRING },
    shipper: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    weight: { type: DataTypes.FLOAT },
    dimensions: { type: DataTypes.STRING },
    value: { type: DataTypes.FLOAT },
    destination: { type: DataTypes.STRING },
    expected_arrival: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING },
    created_by: { type: DataTypes.STRING },
    updated_by: { type: DataTypes.STRING },
    
    // Virtual field for UUID generation (if needed)
    uuid: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('id');
            return id ? generateSaltedUuid(id.toString()) : null;
        }
    }
}, {
    tableName: 'package_prealert',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at'  // Map updatedAt → updated_at
});

// Define associations
PreAlert.belongsTo(User, { foreignKey: 'created_by', as: 'creator', constraints: false });
PreAlert.belongsTo(User, { foreignKey: 'updated_by', as: 'updater', constraints: false });
PreAlert.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Custom toJSON method to exclude sensitive or unnecessary fields
PreAlert.prototype.toJSON = function () {
    const values = { ...this.get() };
    
    // Remove internal/system fields
    delete values.id;
    delete values.courier_id;
    delete values.company_id;
    delete values.created_by;
    delete values.updated_by;
    delete values.matched_package_id;
    
    return values;
};

module.exports = PreAlert;