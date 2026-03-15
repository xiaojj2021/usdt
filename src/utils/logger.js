/**
 * 日志系统 - Winston 多通道
 * combined.log  - 所有 info/warn/error
 * error.log     - 仅 error
 * deposit.log   - 充币相关
 * withdraw.log  - 提币相关
 * collection.log- 归集相关
 * callback.log  - 回调相关
 * chain.log     - 链上交互
 * api.log       - HTTP 请求
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.resolve('./logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const fmt = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, _module, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

const moduleFilter = (mod) =>
  winston.format((info) => (info._module === mod ? info : false))();

const fileOpts = (filename, level) => ({
  filename: path.join(logDir, filename),
  maxsize: 10 * 1024 * 1024,
  maxFiles: 5,
  ...(level ? { level } : {}),
});

const MODULES = ['deposit', 'withdraw', 'collection', 'callback', 'chain', 'api'];

const transports = [
  new winston.transports.Console(),
  new winston.transports.File(fileOpts('combined.log')),
  new winston.transports.File(fileOpts('error.log', 'error')),
];

for (const mod of MODULES) {
  transports.push(
    new winston.transports.File({
      ...fileOpts(`${mod}.log`),
      format: winston.format.combine(moduleFilter(mod), fmt),
    })
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: fmt,
  transports,
});

const PREFIX_MAP = {
  deposit: '充币',
  withdraw: '提币',
  collection: '归集',
  callback: '回调',
  chain: '链上',
  api: '请求',
};

const createModuleLogger = (mod) => {
  const prefix = PREFIX_MAP[mod] || mod;
  const log = (level, msg, meta = {}) =>
    logger.log(level, `[${prefix}] ${msg}`, { _module: mod, ...meta });
  return {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
};

for (const mod of MODULES) {
  logger[mod] = createModuleLogger(mod);
}

module.exports = logger;
