import { Sequelize } from "sequelize";
import * as config from "../../../config/config.js";
const { database } = config.mode === "production" ? config.production : config.development;



//Declare & Assign Connection Variables
export const connection = new Sequelize({
    database: database.db_name,
    host: database.host,
    username: database.username,
    password: database.password,
    dialect: "mysql",
    timezone: '+05:30',
    logging: (sql, timing) => {
        console.log(`[SQL ${timing}ms]`, sql);
    },
    benchmark: true,
    pool: {
        max: 20,
        min: 5,
        acquire: 60000,
        idle: 10000,
        evict: 1000
    }
    // logging: //////console.log,
});

setInterval(() => {
    console.log("Pool size:", connection.connectionManager.pool.size);
    console.log("Pool available:", connection.connectionManager.pool.available);
    console.log("Pool borrowed:", connection.connectionManager.pool.borrowed);
    console.log("Pool pending:", connection.connectionManager.pool.pending);
}, 5000);

try {
    await connection.authenticate();
    console.log("🚀 ~ Connection has been established successfully.");
} catch (error) {
    console.log("🚀 ~ Unable to connect to the database:", error);
}

export const rootuser = config.defaultdata;
export const mailerFunction = config.mailTransporter;
export const mailerHost = config.mailTransporterHost;