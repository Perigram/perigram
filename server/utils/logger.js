import winston from "winston";

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

// Build transports array conditionally
const transports = [
    new winston.transports.Console({
        format: combine(
            // Only colorize in development
            ...(process.env.NODE_ENV !== "production" ? [colorize()] : []),
            timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            errors({ stack: true }),
            logFormat
        )
    })
];

// Add file transports ONLY in non-production environments
if (process.env.NODE_ENV !== "production") {
    transports.push(
        new winston.transports.File({ filename: "logs/error.log", level: "error" }),
        new winston.transports.File({ filename: "logs/combined.log" })
    );
}

const logger = winston.createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transports,
    exitOnError: false,
});

export default logger;

