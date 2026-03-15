/**
 * 提币管理服务
 */
const db = require('../database/db');
const logger = require('../utils/logger');

/**
 * 创建提币订单
 */
const create = (data) => {
  const orderNo = 'WIT' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();

  const auditMode = db.prepare(`SELECT config_value FROM system_config WHERE config_key = 'withdraw_audit_mode'`).get();
  let needAudit = false;
  if (auditMode?.config_value === 'manual') {
    needAudit = true;
  } else if (auditMode?.config_value === 'threshold') {
    const thresholdRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = 'withdraw_audit_threshold'`).get();
    const threshold = parseFloat(thresholdRow?.config_value || 100);
    needAudit = parseFloat(data.amount) >= threshold;
  }
  const status = needAudit ? 3 : 0;
  const auditStatus = needAudit ? 0 : 1;

  const stmt = db.prepare(`
    INSERT INTO withdraw_order (order_no, merchant_order_no, merchant_id, chain_type, to_address, amount, fee, audit_status, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(orderNo, data.merchant_order_no || '', data.merchant_id, data.chain_type, data.to_address, data.amount, data.fee || '0', auditStatus, status);
  logger.info('[提币] 创建订单', { orderNo, to: data.to_address, amount: data.amount, needAudit });
  return { order_no: orderNo, need_audit: needAudit };
};

/**
 * 风控校验
 */
const riskCheck = (data) => {
  const errors = [];

  const maxAmount = db.prepare(`SELECT config_value FROM system_config WHERE config_key = 'withdraw_max_amount'`).get();
  if (maxAmount && parseFloat(data.amount) > parseFloat(maxAmount.config_value)) {
    errors.push(`单笔金额超限：最大 ${maxAmount.config_value}`);
  }

  const blacklistRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = 'blacklist_addresses'`).get();
  if (blacklistRow) {
    try {
      const blacklist = JSON.parse(blacklistRow.config_value);
      if (blacklist.includes(data.to_address)) {
        errors.push('目标地址在黑名单中');
      }
    } catch (e) { /* 忽略 */ }
  }

  const existingOrder = db.prepare(`SELECT id FROM withdraw_order WHERE merchant_order_no = ? AND merchant_id = ?`)
    .get(data.merchant_order_no, data.merchant_id);
  if (existingOrder) {
    errors.push('商户订单号已存在（幂等校验）');
  }

  return errors;
};

/**
 * 审核通过
 */
const approve = (id, auditUser) => {
  db.prepare(`
    UPDATE withdraw_order SET audit_status = 1, audit_user = ?, audit_time = datetime('now','localtime'),
    status = 0, update_time = datetime('now','localtime') WHERE id = ? AND audit_status = 0
  `).run(auditUser, id);
};

/**
 * 审核驳回
 */
const reject = (id, auditUser, remark) => {
  db.prepare(`
    UPDATE withdraw_order SET audit_status = 2, audit_user = ?, audit_remark = ?,
    audit_time = datetime('now','localtime'), status = 2, update_time = datetime('now','localtime')
    WHERE id = ? AND audit_status = 0
  `).run(auditUser, remark, id);
};

/**
 * 更新链上状态
 */
const updateChainStatus = (orderNo, txid, status, errorMsg = '') => {
  db.prepare(`
    UPDATE withdraw_order SET txid = ?, status = ?, error_msg = ?, update_time = datetime('now','localtime')
    WHERE order_no = ?
  `).run(txid, status, errorMsg, orderNo);
};

/**
 * 更新回调状态
 */
const updateCallbackStatus = (orderNo, status, times) => {
  db.prepare(`UPDATE withdraw_order SET callback_status = ?, callback_times = ?, update_time = datetime('now','localtime') WHERE order_no = ?`)
    .run(status, times, orderNo);
};

/**
 * 获取待处理提币订单
 */
const getPendingOrders = () => {
  return db.prepare('SELECT * FROM withdraw_order WHERE status = 0 AND audit_status = 1').all();
};

/**
 * 获取待审核订单
 */
const getPendingAuditOrders = () => {
  return db.prepare('SELECT * FROM withdraw_order WHERE audit_status = 0').all();
};

/**
 * 增加重试次数
 */
const incrementRetry = (orderNo) => {
  db.prepare(`UPDATE withdraw_order SET retry_count = retry_count + 1, update_time = datetime('now','localtime') WHERE order_no = ?`)
    .run(orderNo);
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
  if (filters.audit_status !== undefined && filters.audit_status !== '') { where += ' AND audit_status = ?'; params.push(filters.audit_status); }
  if (filters.order_no) { where += ' AND order_no LIKE ?'; params.push(`%${filters.order_no}%`); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM withdraw_order WHERE ${where}`).get(...params).count;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = db.prepare(`SELECT * FROM withdraw_order WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params);
  return { list: rows, total };
};

const getByOrderNo = (orderNo) => {
  return db.prepare('SELECT * FROM withdraw_order WHERE order_no = ?').get(orderNo);
};

const getById = (id) => {
  return db.prepare('SELECT * FROM withdraw_order WHERE id = ?').get(id);
};

module.exports = { create, riskCheck, approve, reject, updateChainStatus, updateCallbackStatus, getPendingOrders, getPendingAuditOrders, incrementRetry, list, getByOrderNo, getById };
