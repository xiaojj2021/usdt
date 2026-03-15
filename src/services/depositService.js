/**
 * 充币管理服务
 */
const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * 创建充币订单
 */
const create = (data) => {
  const orderNo = 'DEP' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO deposit_order (order_no, address, chain_type, amount, txid, confirmations, status, merchant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  try {
    stmt.run(orderNo, data.address, data.chain_type, data.amount, data.txid, data.confirmations || 0, 0, data.merchant_id);
    logger.info('[充币] 创建订单', { orderNo, txid: data.txid, amount: data.amount });
    return orderNo;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      logger.info('[充币] 订单已存在，跳过', { txid: data.txid });
      return null;
    }
    throw err;
  }
};

/**
 * 更新确认数
 */
const updateConfirmations = (txid, confirmations) => {
  db.prepare(`UPDATE deposit_order SET confirmations = ?, update_time = datetime('now','localtime') WHERE txid = ?`)
    .run(confirmations, txid);
};

/**
 * 确认成功
 */
const confirmSuccess = (txid) => {
  db.prepare(`UPDATE deposit_order SET status = 1, update_time = datetime('now','localtime') WHERE txid = ?`).run(txid);
};

/**
 * 更新回调状态
 */
const updateCallbackStatus = (orderNo, status, times) => {
  db.prepare(`UPDATE deposit_order SET callback_status = ?, callback_times = ?, update_time = datetime('now','localtime') WHERE order_no = ?`)
    .run(status, times, orderNo);
};

/**
 * 获取待确认订单
 */
const getPendingOrders = () => {
  return db.prepare('SELECT * FROM deposit_order WHERE status = 0').all();
};

/**
 * 获取待回调订单
 */
const getPendingCallbackOrders = () => {
  return db.prepare(`
    SELECT d.*, m.callback_url FROM deposit_order d
    LEFT JOIN merchant m ON d.merchant_id = m.id
    WHERE d.status = 1 AND d.callback_status != 1 AND d.callback_times < 5
  `).all();
};

/**
 * 订单列表
 */
const list = (page = 1, pageSize = 20, filters = {}) => {
  let where = '1=1';
  const params = [];
  if (filters.chain_type) { where += ' AND chain_type = ?'; params.push(filters.chain_type); }
  if (filters.merchant_id) { where += ' AND merchant_id = ?'; params.push(filters.merchant_id); }
  if (filters.status !== undefined && filters.status !== '') { where += ' AND status = ?'; params.push(filters.status); }
  if (filters.address) { where += ' AND address LIKE ?'; params.push(`%${filters.address}%`); }
  if (filters.order_no) { where += ' AND order_no LIKE ?'; params.push(`%${filters.order_no}%`); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM deposit_order WHERE ${where}`).get(...params).count;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = db.prepare(`SELECT * FROM deposit_order WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params);
  return { list: rows, total };
};

/**
 * 根据订单号查询
 */
const getByOrderNo = (orderNo) => {
  return db.prepare('SELECT * FROM deposit_order WHERE order_no = ?').get(orderNo);
};

/**
 * 检查 txid 是否已存在（包括已删除的）
 */
const existsByTxid = (txid) => {
  const row = db.prepare('SELECT id FROM deposit_order WHERE txid = ?').get(txid);
  if (row) return true;
  try {
    const deleted = db.prepare('SELECT id FROM deleted_txid WHERE txid = ?').get(txid);
    return !!deleted;
  } catch (e) {
    return false;
  }
};

module.exports = { create, updateConfirmations, confirmSuccess, updateCallbackStatus, getPendingOrders, getPendingCallbackOrders, list, getByOrderNo, existsByTxid };
