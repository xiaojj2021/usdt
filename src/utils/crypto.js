/**
 * 加密工具模块
 * AES-256-CBC 私钥加密、MD5 签名、API 签名验签
 * 注：AES-256-CBC 要求 Key=32字节、IV=16字节，此处自动派生确保长度正确
 */
const crypto = require('crypto');

/** 从字符串派生 32 字节密钥 */
const getAesKey = () => {
  const raw = process.env.AES_SECRET_KEY || 'default-aes-256-key-32-chars!!!';
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length === 32) return buf;
  return crypto.createHash('sha256').update(raw).digest();
};

/** 从字符串派生 16 字节 IV（AES 块大小，必须严格 16 字节） */
const getAesIv = () => {
  const raw = process.env.AES_IV || 'default-iv-16ch!';
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length === 16) return buf;
  return crypto.createHash('md5').update(raw).digest(); // MD5 固定 16 字节
};

const aesEncrypt = (plainText) => {
  const key = getAesKey();
  const iv = getAesIv();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const aesDecrypt = (cipherText) => {
  const key = getAesKey();
  const iv = getAesIv();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(cipherText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const md5 = (str) => {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
};

/**
 * 生成 API 签名
 * 规则：将参数按 key 字典排序，拼接为 key=value&... 后追加 &secret=xxx，取 MD5
 */
const generateSign = (params, secret) => {
  const sorted = Object.keys(params).sort();
  const parts = sorted.map(k => `${k}=${params[k]}`);
  parts.push(`secret=${secret}`);
  return md5(parts.join('&')).toUpperCase();
};

/**
 * 验证 API 签名
 */
const verifySign = (params, secret) => {
  const { sign, ...rest } = params;
  if (!sign) return false;
  const expected = generateSign(rest, secret);
  return sign === expected;
};

/**
 * 生成 API Key
 */
const generateApiKey = () => {
  return 'ak_' + crypto.randomBytes(20).toString('hex');
};

/**
 * 生成 API Secret
 */
const generateApiSecret = () => {
  return 'sk_' + crypto.randomBytes(32).toString('hex');
};

module.exports = {
  aesEncrypt,
  aesDecrypt,
  md5,
  generateSign,
  verifySign,
  generateApiKey,
  generateApiSecret,
};
