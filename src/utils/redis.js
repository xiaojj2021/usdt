/**
 * Redis 连接实例
 */
const Redis = require('ioredis');
const logger = require('./logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times) => Math.min(times * 500, 5000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('[Redis] 连接成功'));
redis.on('error', (err) => logger.error('[Redis] 连接异常', { error: err.message }));

module.exports = redis;
