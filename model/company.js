const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encrypt,generateSaltedUuid } = require('./encrypt'); // Adjust path if needed

const Company = sequelize.define('Company', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  name: {
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
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  encrypted_id: {
    type: DataTypes.VIRTUAL,
    get() {
      const id = this.getDataValue('id');
      return id ? encrypt(id.toString()) : null;
    }
  }
}, {
  tableName: 'Company',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Company;
