const {Sequelize} = require('sequelize');
require('dotenv').config(); // Load environment variables

const sequelize = new Sequelize({
    dialect: 'mysql',
    replication: {
        read: [
            {
                host: 'db-ro-mysql-sfo3-87632-do-user-13043637-0.m.db.ondigitalocean.com',
                username: 'doadmin',
                port: 25060,
                password: 'AVNS_laQHOJ5_y6tsIdsmZWv',
                database: 'warehouse'
            }
        ],
        write: {
            host: 'db-mysql-sfo3-36855-do-user-13043637-0.i.db.ondigitalocean.com',
            username: 'doadmin',
            port: 25060,
            password: 'AVNS_laQHOJ5_y6tsIdsmZWv',
            database: 'warehouse'
        }
    },
    pool: {
        max: 10, // Maximum number of connections
        idle: 10000, // Connection idle time in ms
        acquire: 30000 // Max time to acquire a connection in ms
    },
    logging: false // Disable logging; set to console.log for debugging
});

module.exports = sequelize;
