/**
 * 钱包地址管理服务
 */
const db = require('../database/db');
const chain = require('../chain');
const { aesEncrypt, aesDecrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

/**
 * 生成单个地址
 * @param {boolean} setAsMain - 是否设为主地址（用于归集）
 */
const generate = async (chainType, merchantId, userId = null, setAsMain = false) => {
  const { address, privateKey } = await chain.generateAddress(chainType);
  const encryptedKey = aesEncrypt(privateKey);

  if (setAsMain) {
    db.prepare(`UPDATE wallet_address SET is_main = 0 WHERE merchant_id = ? AND chain_type = ?`).run(merchantId, chainType);
  }

  const stmt = db.prepare(`
    INSERT INTO wallet_address (chain_type, address, encrypted_private_key, merchant_id, user_id, is_main)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(chainType, address, encryptedKey, merchantId, userId, setAsMain ? 1 : 0);
  logger.info('[地址] 生成成功', { chainType, address, merchantId, isMain: setAsMain });
  return { id: result.lastInsertRowid, chain_type: chainType, address, merchant_id: merchantId, user_id: userId, is_main: setAsMain ? 1 : 0 };
};

/**
 * 批量生成地址
 * @param {boolean} setFirstAsMain - 是否将第一个设为主地址
 */
const batchGenerate = async (chainType, merchantId, count, userIds = [], setFirstAsMain = false) => {
  const results = [];
  for (let i = 0; i < count; i++) {
    const userId = userIds[i] || null;
    const addr = await generate(chainType, merchantId, userId, setFirstAsMain && i === 0);
    results.push(addr);
  }
  return results;
};

/**
 * 获取地址私钥（内部使用，解密）
 */
const getPrivateKey = (address) => {
  const row = db.prepare('SELECT encrypted_private_key FROM wallet_address WHERE address = ? AND status = 1').get(address);
  if (!row) throw new Error(`地址不存在或已禁用: ${address}`);
  return aesDecrypt(row.encrypted_private_key);
};

/**
 * 查询余额（链上实时）
 */
const queryBalance = async (address) => {
  const row = db.prepare('SELECT chain_type FROM wallet_address WHERE address = ?').get(address);
  if (!row) throw new Error(`地址不存在: ${address}`);
  const balance = await chain.getUSDTBalance(row.chain_type, address);
  db.prepare(`UPDATE wallet_address SET balance = ? WHERE address = ?`).run(balance, address);
  return { address, chain_type: row.chain_type, balance };
};

/**
 * 地址列表查询
 */
const list = async (page = 1, pageSize = 20, filters = {}, refreshOnChain = false) => {
  let where = '1=1';
  const params = [];
  if (filters.chain_type) { where += ' AND chain_type = ?'; params.push(filters.chain_type); }
  if (filters.merchant_id) { where += ' AND merchant_id = ?'; params.push(filters.merchant_id); }
  if (filters.status !== undefined && filters.status !== '') { where += ' AND status = ?'; params.push(filters.status); }
  if (filters.address) { where += ' AND address LIKE ?'; params.push(`%${filters.address}%`); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM wallet_address WHERE ${where}`).get(...params).count;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = db.prepare(`
    SELECT id, chain_type, address, merchant_id, user_id, balance, status, is_main, create_time
    FROM wallet_address WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(...params);

  if (refreshOnChain) {
    for (const row of rows) {
      try {
        const bal = await chain.getUSDTBalance(row.chain_type, row.address);
        db.prepare('UPDATE wallet_address SET balance = ? WHERE id = ?').run(bal, row.id);
        row.balance = bal;
      } catch (e) { /* keep cached */ }
    }
  }

  return { list: rows, total };
};

/**
 * 禁用地址
 */
const disable = (id) => {
  db.prepare('UPDATE wallet_address SET status = 0 WHERE id = ?').run(id);
};

/**
 * 查询有余额的子地址（归集用，排除主地址）
 */
const getAddressesWithBalance = (chainType, threshold = 0) => {
  return db.prepare(`
    SELECT * FROM wallet_address
    WHERE chain_type = ? AND status = 1 AND (is_main = 0 OR is_main IS NULL) AND CAST(balance AS REAL) > ?
  `).all(chainType, threshold);
};

/**
 * 通过地址查询记录
 */
const getByAddress = (address) => {
  return db.prepare('SELECT * FROM wallet_address WHERE address = ?').get(address);
};

/**
 * 设为主地址（用于归集）
 */
const setMainAddress = (id) => {
  const row = db.prepare('SELECT merchant_id, chain_type FROM wallet_address WHERE id = ?').get(id);
  if (!row) throw new Error('地址不存在');
  db.prepare(`UPDATE wallet_address SET is_main = 0 WHERE merchant_id = ? AND chain_type = ?`).run(row.merchant_id, row.chain_type);
  db.prepare(`UPDATE wallet_address SET is_main = 1 WHERE id = ?`).run(id);
};

/**
 * 取消主地址
 */
const cancelMainAddress = (id) => {
  const row = db.prepare('SELECT is_main FROM wallet_address WHERE id = ?').get(id);
  if (!row) throw new Error('地址不存在');
  if (row.is_main !== 1) throw new Error('该地址不是主地址');
  db.prepare(`UPDATE wallet_address SET is_main = 0 WHERE id = ?`).run(id);
};

/**
 * 获取商户+链的主地址
 */
const getMainAddress = (merchantId, chainType) => {
  const row = db.prepare('SELECT address FROM wallet_address WHERE merchant_id = ? AND chain_type = ? AND is_main = 1 AND status = 1').get(merchantId, chainType);
  return row?.address || null;
};

module.exports = { generate, batchGenerate, getPrivateKey, queryBalance, list, disable, getAddressesWithBalance, getByAddress, setMainAddress, cancelMainAddress, getMainAddress };
