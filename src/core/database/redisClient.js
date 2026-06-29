import { createClient } from 'redis';

const redisUrl =
    process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST || "gloup-redis"}:6379`;

const redisClient = createClient({ url: redisUrl });

redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Connect immediately
await redisClient.connect();

export default redisClient;
