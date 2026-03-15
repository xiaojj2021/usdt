/**
 * 系统配置服务
 */
const db = require('../database/db');

const get = (key) => {
  const row = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get(key);
  return row?.config_value ?? null;
};

const set = (key, value) => {
  const exists = db.prepare('SELECT id FROM system_config WHERE config_key = ?').get(key);
  if (exists) {
    db.prepare(`UPDATE system_config SET config_value = ?, update_time = datetime('now','localtime') WHERE config_key = ?`)
      .run(value, key);
  } else {
    db.prepare(`INSERT INTO system_config (config_key, config_value) VALUES (?, ?)`).run(key, value);
  }
};

const getAll = () => {
  return db.prepare('SELECT * FROM system_config ORDER BY id').all();
};

const batchUpdate = (configs) => {
  for (const item of configs) {
    const key = item.key || item.config_key;
    const value = String(item.value ?? item.config_value ?? '');
    if (key) set(key, value);
  }
  const { saveToDisk } = require('../database/db');
  if (typeof saveToDisk === 'function') saveToDisk();
};

module.exports = { get, set, getAll, batchUpdate };
