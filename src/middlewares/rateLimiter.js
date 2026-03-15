/**
 * 限流中间件
 */
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { code: 429, msg: '请求过于频繁，请稍后再试', data: null },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { code: 429, msg: '登录尝试过多，请15分钟后再试', data: null },
});

module.exports = { apiLimiter, loginLimiter };
