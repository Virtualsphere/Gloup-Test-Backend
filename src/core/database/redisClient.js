import { createClient } from 'redis';

const redisClient = createClient({
    url: 'redis://gloup-redis:6379' // Points to the redis container in docker-compose
});

redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Connect immediately
await redisClient.connect();

export default redisClient;
