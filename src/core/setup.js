import chalk from 'chalk';
import { Configurations, dbConnection, dbSync } from './database/initialize.js';
import { runPendingMigrations } from './database/migrator.js';
import { Logger } from './lib/logger.js';


//Execute Table from initializejs
export const setup = async (gloablConfig) => {
    
    // Check App Connection
    //////console.log();
    await processBlock(dbConnection, chalk.green('Database Authenticated  ✔️ '), chalk.red('Database Connection Failed ✖️'));

    // Versioned schema migrations (Umzug) — alters/indexes that sync() cannot do safely
    await processBlock(
        runPendingMigrations,
        chalk.green('Database Migrations Applied  ✔️ '),
        chalk.red('Database Migrations Failed ✖️')
    );
    
    // Sync creates missing tables only (force:false). Column/ENUM changes belong in migrations/.
    await processBlock(dbSync, chalk.green('Database Tables Synced  ✔️ '), chalk.red('Database Sync Failed ✖️'));
    
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
        if (error?.original) {
            Logger.error(JSON.stringify({
                name: error.name,
                errno: error.original.errno,
                code: error.original.code,
                sqlState: error.original.sqlState,
                sqlMessage: error.original.sqlMessage,
                sql: error.sql,
            }));
        }
        Logger.error(error?.stack || error?.message || String(error))
        throw error
    }
}

