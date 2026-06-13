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
    logging: false,
    benchmark: false,
    pool: {
        max: 50,
        min: 10,
        acquire: 30000,
        idle: 10000,
        evict: 1000,
        handleDisconnects: true
    }
});

setInterval(() => {
    const pool = connection.connectionManager.pool;
    if (pool.pending > 5) {
        console.warn(`⚠️ DB pool under pressure — pending: ${pool.pending}, borrowed: ${pool.borrowed}/${pool.size}`);
    }
}, 10000);

try {
    await connection.authenticate();
    console.log("Connection has been established successfully.");
} catch (error) {
    console.error("Unable to connect to the database:", error);
}

export const rootuser = config.defaultdata;
export const mailerFunction = config.mailTransporter;
export const mailerHost = config.mailTransporterHost;