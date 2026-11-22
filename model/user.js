const {DataTypes} = require('sequelize');
const sequelize = require('../config/database'); // Import DB connection
const {encrypt,generateSaltedUuid} = require('./encrypt'); // adjust path accordingly

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    first_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    last_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    mailbox: {
        type: DataTypes.STRING,
        allowNull: true
    },
    branch: {
        type: DataTypes.STRING,
        allowNull: true
    },
    courier_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    email_verified_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    remember_token: {
        type: DataTypes.STRING,
        allowNull: true
    },
    encrypted_id: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('id');
            return id ? encrypt(id.toString()) : null;
        }
    },
    uuid: {
        type: DataTypes.VIRTUAL,
        get() {
            const id = this.getDataValue('id');
            return id ? generateSaltedUuid(id.toString()) : null;
        }
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at', // Map createdAt → created_at
    updatedAt: 'updated_at',
    defaultScope: {
        attributes: {exclude: ['password', 'remember_token']}
    },
    scopes: {
        withSensitiveData: {
            attributes: {include: ['password', 'remember_token']}
        }
    }  // Map updatedAt → updated_at
});
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.id;
  delete values.password;
  delete values.remember_token;
  return values;
};
module.exports = User;
