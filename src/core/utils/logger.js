import path from 'path';
import winston from 'winston';
// import '../../../config/index.js'
import dotenv from "dotenv";
dotenv.config();
const logger = winston.createLogger()

if (process.env.NODE_ENV == 'development') {
    logger.add(
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.splat(),
                winston.format.colorize(),
                winston.format.simple()
            ),
        })
    )
}

if (process.env.NODE_ENV == 'production') {
    logger.add(
        new winston.transports.File({
            level: 'info',
            handleExceptions: true,
            filename: `${path.join(path.resolve(), 'logs/info.log')}`,
            format: winston.format.combine(
                winston.format.json(),
                winston.format.prettyPrint(),
                winston.format.timestamp({
                    format: 'YYYY-MM-DD hh:mm:ss'
                }),
                winston.format.printf((info) => {
                    return `[${info.timestamp}]${info.level}: ${info.message}`
                })
            )
        })
    )
    logger.add(
        new winston.transports.File({
            level: "error",
            filename: path.join(path.resolve(), "logs/error.log"),
            format: winston.format.combine(
                winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
                winston.format.json()
            ),
        })
    );
}

winston.add(logger)

export default logger