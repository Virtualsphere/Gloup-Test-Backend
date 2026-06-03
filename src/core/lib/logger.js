import dotenv from "dotenv";
import path from 'path';
import winston from 'winston';
dotenv.config();
export const Logger = winston.createLogger()

if (process.env.APP_NAME === 'production') {
    Logger.add(
        new winston.transports.File({
            level: 'info',
            handleExceptions: true,
            filename: `${path.join(path.resolve(),'logs/info.log')}`,
            format: winston.format.combine(
                winston.format.json(),
                winston.format.prettyPrint(),
                winston.format.timestamp({
                    format: 'DD-MM-YYYY hh:mm:ss'
                }),
                winston.format.printf((info) => {
                    return `[${info.timestamp}] ${info.level} : ${info.message}`
                })
            )

        })
    )
} else {
    Logger.add(
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.splat(),
                winston.format.simple()
            )
        })
    )
}