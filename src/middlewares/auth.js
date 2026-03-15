/**
 * 鉴权中间件
 */
const jwt = require('jsonwebtoken');
const merchantService = require('../services/merchantService');
const { verifySign } = require('../utils/crypto');
const { error } = require('../utils/response');
const logService = require('../services/logService');

/**
 * 商户 API 鉴权中间件
 * 校验：API Key + 签名 + 时间戳防重放 + IP 白名单
 */
const merchantAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const timestamp = req.headers['x-timestamp'] || req.body?.timestamp || req.query?.timestamp;
  const sign = req.headers['x-sign'] || req.body?.sign || req.query?.sign;

  if (!apiKey) return res.status(401).json(error('缺少 API Key', 401));
  if (!timestamp) return res.status(401).json(error('缺少时间戳', 401));
  if (!sign) return res.status(401).json(error('缺少签名', 401));

  // 时间戳防重放（5分钟有效）
  const now = Date.now();
  if (Math.abs(now - parseInt(timestamp)) > 5 * 60 * 1000) {
    return res.status(401).json(error('请求已过期', 401));
  }

  const merchant = merchantService.getByApiKey(apiKey);
  if (!merchant) return res.status(401).json(error('无效的 API Key', 401));
  if (merchant.status !== 1) return res.status(403).json(error('商户已禁用', 403));

  // IP 白名单校验
  if (merchant.ip_whitelist) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const whitelist = merchant.ip_whitelist.split(',').map(ip => ip.trim());
    const normalizedClientIp = clientIp.replace('::ffff:', '');
    if (!whitelist.includes(normalizedClientIp) && !whitelist.includes('*')) {
      logService.write('api', '鉴权', 'IP拒绝', `${normalizedClientIp} 不在白名单中`, normalizedClientIp, apiKey);
      return res.status(403).json(error('IP 不在白名单中', 403));
    }
  }

  // 签名校验
  const params = { ...req.body, ...req.query, timestamp, api_key: apiKey };
  delete params.sign;
  params.sign = sign;
  if (!verifySign(params, merchant.api_secret)) {
    return res.status(401).json(error('签名校验失败', 401));
  }

  req.merchant = merchant;
  logService.write('api', '鉴权', 'API调用', `${req.method} ${req.originalUrl}`, req.ip, apiKey);
  next();
};

/**
 * 管理后台 JWT 鉴权
 */
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json(error('未登录', 401));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json(error('登录已过期', 401));
  }
};

module.exports = { merchantAuth, adminAuth };
