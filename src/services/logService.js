/**
 * 系统日志服务
 */
const db = require('../database/db');

/**
 * 写入日志
 */
const write = (logType, module, action, content, ip = '', operator = '') => {
  db.prepare(`
    INSERT INTO system_log (log_type, module, action, content, ip, operator) VALUES (?, ?, ?, ?, ?, ?)
  `).run(logType, module, action, typeof content === 'string' ? content : JSON.stringify(content), ip, operator);
};

/**
 * 日志列表查询
 */
const list = (page = 1, pageSize = 20, filters = {}) => {
  let where = '1=1';
  const params = [];
  if (filters.log_type) { where += ' AND log_type = ?'; params.push(filters.log_type); }
  if (filters.module) { where += ' AND module LIKE ?'; params.push(`%${filters.module}%`); }
  if (filters.operator) { where += ' AND operator LIKE ?'; params.push(`%${filters.operator}%`); }
  if (filters.start_time) { where += ' AND create_time >= ?'; params.push(filters.start_time); }
  if (filters.end_time) { where += ' AND create_time <= ?'; params.push(filters.end_time); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM system_log WHERE ${where}`).get(...params).count;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = db.prepare(`SELECT * FROM system_log WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params);
  return { list: rows, total };
};

module.exports = { write, list };
