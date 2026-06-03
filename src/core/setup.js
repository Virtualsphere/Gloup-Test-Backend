import chalk from 'chalk';
import { Configurations, dbConnection, dbSync } from './database/initialize.js';
import { Logger } from './lib/logger.js';


//Execute Table from initializejs
export const setup = async (gloablConfig) => {
    
    // Check App Connection
    //////console.log();
    await processBlock(dbConnection, chalk.green('Database Authenticated  ✔️ '), chalk.red('Database Connection Failed ✖️'));
    
    //Sync Db Models
    dbSync();
    
    // Set App Configurations Globals
    await processBlock(Configurations, chalk.green('Configurations Validated  ✔️ ✔️ '),  chalk.red('Configurations Invalid ✖️'));
    return gloablConfig
    
}

const processBlock = async (func,successTxt, errorTxt) => {
    try {
        await func();
        Logger.info(successTxt)
    } catch (error) {
        Logger.error(errorTxt)
        throw new Error(error)
    }
}

