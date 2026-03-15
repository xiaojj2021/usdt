/**
 * Bull 任务队列定义
 */
const Bull = require('bull');
const logger = require('../utils/logger');

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
};

const withdrawQueue = new Bull('withdraw-process', { redis: redisConfig });
const callbackQueue = new Bull('callback-retry', { redis: redisConfig });

[withdrawQueue, callbackQueue].forEach(q => {
  q.on('error', (err) => logger.error(`[队列] ${q.name} 异常`, { error: err.message }));
  q.on('failed', (job, err) => logger.error(`[队列] ${q.name} 任务失败`, { jobId: job.id, error: err.message }));
});

module.exports = { withdrawQueue, callbackQueue };
