/**
 * 商户管理服务
 */
const db = require('../database/db');
const { generateApiKey, generateApiSecret } = require('../utils/crypto');
const { v4: uuidv4 } = require('uuid');

const create = (data) => {
  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();
  const stmt = db.prepare(`
    INSERT INTO merchant (merchant_name, api_key, api_secret, callback_url, ip_whitelist, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.merchant_name,
    apiKey,
    apiSecret,
    data.callback_url || '',
    data.ip_whitelist || '',
    data.status ?? 1
  );
  return { id: result.lastInsertRowid, api_key: apiKey, api_secret: apiSecret };
};

const update = (id, data) => {
  const fields = [];
  const values = [];
  if (data.merchant_name !== undefined) { fields.push('merchant_name = ?'); values.push(data.merchant_name); }
  if (data.callback_url !== undefined) { fields.push('callback_url = ?'); values.push(data.callback_url); }
  if (data.ip_whitelist !== undefined) { fields.push('ip_whitelist = ?'); values.push(data.ip_whitelist); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  fields.push("update_time = datetime('now','localtime')");
  values.push(id);

  db.prepare(`UPDATE merchant SET ${fields.join(', ')} WHERE id = ?`).run(...values);
};

const resetKeys = (id) => {
  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();
  db.prepare(`UPDATE merchant SET api_key = ?, api_secret = ?, update_time = datetime('now','localtime') WHERE id = ?`)
    .run(apiKey, apiSecret, id);
  return { api_key: apiKey, api_secret: apiSecret };
};

const getById = (id) => {
  return db.prepare('SELECT * FROM merchant WHERE id = ?').get(id);
};

const getByApiKey = (apiKey) => {
  return db.prepare('SELECT * FROM merchant WHERE api_key = ?').get(apiKey);
};

const list = (page = 1, pageSize = 20, filters = {}) => {
  let where = '1=1';
  const params = [];
  if (filters.merchant_name) { where += ' AND merchant_name LIKE ?'; params.push(`%${filters.merchant_name}%`); }
  if (filters.status !== undefined && filters.status !== '') { where += ' AND status = ?'; params.push(filters.status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM merchant WHERE ${where}`).get(...params).count;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = db.prepare(`SELECT * FROM merchant WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params);
  return { list: rows, total };
};

const disable = (id) => {
  db.prepare(`UPDATE merchant SET status = 0, update_time = datetime('now','localtime') WHERE id = ?`).run(id);
};

const enable = (id) => {
  db.prepare(`UPDATE merchant SET status = 1, update_time = datetime('now','localtime') WHERE id = ?`).run(id);
};

module.exports = { create, update, resetKeys, getById, getByApiKey, list, disable, enable };
