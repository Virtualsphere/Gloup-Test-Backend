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
    timezone: '+05:30' ,
    logging: false,
    // logging: //////console.log,
});




export const rootuser = config.defaultdata;
export const mailerFunction = config.mailTransporter;
export const mailerHost = config.mailTransporterHost;