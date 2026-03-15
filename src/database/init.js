/**
 * SQLite 数据库初始化模块（基于 sql.js）
 * 创建所有业务表、插入默认配置数据
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');

async function main() {
  const { initDatabase, saveToDisk } = require('./db');
  const db = await initDatabase();

  db.exec(`
    -- 管理员表
    CREATE TABLE IF NOT EXISTS admin_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT,
      role TEXT DEFAULT 'admin',
      status INTEGER DEFAULT 1,
      last_login_time TEXT,
      create_time TEXT DEFAULT (datetime('now','localtime')),
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 商户表
    CREATE TABLE IF NOT EXISTS merchant (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_name TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      api_secret TEXT NOT NULL,
      callback_url TEXT,
      ip_whitelist TEXT,
      status INTEGER DEFAULT 1,
      create_time TEXT DEFAULT (datetime('now','localtime')),
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 钱包地址表
    CREATE TABLE IF NOT EXISTS wallet_address (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_type TEXT NOT NULL,
      address TEXT UNIQUE NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      merchant_id INTEGER NOT NULL,
      user_id TEXT,
      balance TEXT DEFAULT '0',
      status INTEGER DEFAULT 1,
      is_main INTEGER DEFAULT 0,
      create_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 充币订单
    CREATE TABLE IF NOT EXISTS deposit_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      amount TEXT NOT NULL,
      txid TEXT UNIQUE NOT NULL,
      confirmations INTEGER DEFAULT 0,
      status INTEGER DEFAULT 0,
      callback_status INTEGER DEFAULT 0,
      callback_times INTEGER DEFAULT 0,
      merchant_id INTEGER,
      create_time TEXT DEFAULT (datetime('now','localtime')),
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 提币订单
    CREATE TABLE IF NOT EXISTS withdraw_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      merchant_order_no TEXT,
      merchant_id INTEGER NOT NULL,
      chain_type TEXT NOT NULL,
      from_address TEXT,
      to_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      fee TEXT DEFAULT '0',
      audit_status INTEGER DEFAULT 0,
      audit_remark TEXT,
      audit_user TEXT,
      audit_time TEXT,
      txid TEXT,
      status INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      callback_status INTEGER DEFAULT 0,
      callback_times INTEGER DEFAULT 0,
      error_msg TEXT,
      create_time TEXT DEFAULT (datetime('now','localtime')),
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 批量任务表
    CREATE TABLE IF NOT EXISTS batch_task (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT UNIQUE NOT NULL,
      task_type TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      audit_status INTEGER DEFAULT 0,
      audit_user TEXT,
      audit_time TEXT,
      status INTEGER DEFAULT 0,
      merchant_id INTEGER,
      create_time TEXT DEFAULT (datetime('now','localtime')),
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 批量任务子单
    CREATE TABLE IF NOT EXISTS batch_task_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      from_address TEXT,
      to_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      txid TEXT,
      status INTEGER DEFAULT 0,
      error_msg TEXT,
      retry_count INTEGER DEFAULT 0,
      create_time TEXT DEFAULT (datetime('now','localtime')),
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 系统配置表
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT,
      description TEXT,
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 系统日志表
    CREATE TABLE IF NOT EXISTS system_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_type TEXT,
      module TEXT,
      action TEXT,
      content TEXT,
      ip TEXT,
      operator TEXT,
      create_time TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 区块扫描进度表
    CREATE TABLE IF NOT EXISTS scan_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_type TEXT UNIQUE NOT NULL,
      last_block INTEGER DEFAULT 0,
      update_time TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  console.log('[数据库] 所有表创建完成');

  // 创建索引（sql.js 中分开执行）
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_wallet_merchant ON wallet_address(merchant_id)',
    'CREATE INDEX IF NOT EXISTS idx_wallet_chain ON wallet_address(chain_type)',
    'CREATE INDEX IF NOT EXISTS idx_deposit_merchant ON deposit_order(merchant_id)',
    'CREATE INDEX IF NOT EXISTS idx_deposit_status ON deposit_order(status)',
    'CREATE INDEX IF NOT EXISTS idx_deposit_address ON deposit_order(address)',
    'CREATE INDEX IF NOT EXISTS idx_withdraw_merchant ON withdraw_order(merchant_id)',
    'CREATE INDEX IF NOT EXISTS idx_withdraw_status ON withdraw_order(status)',
    'CREATE INDEX IF NOT EXISTS idx_withdraw_audit ON withdraw_order(audit_status)',
    'CREATE INDEX IF NOT EXISTS idx_batch_task_merchant ON batch_task(merchant_id)',
    'CREATE INDEX IF NOT EXISTS idx_batch_item_task ON batch_task_item(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_log_type ON system_log(log_type)',
    'CREATE INDEX IF NOT EXISTS idx_log_time ON system_log(create_time)',
  ];
  for (const sql of indexes) {
    db.exec(sql);
  }
  console.log('[数据库] 索引创建完成');

  // 迁移：为已有 wallet_address 表添加 is_main 列
  try {
    db.exec('ALTER TABLE wallet_address ADD COLUMN is_main INTEGER DEFAULT 0');
    console.log('[数据库] 已添加 wallet_address.is_main 列');
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }

  // 插入默认配置
  const configs = [
    ['withdraw_audit_mode', 'auto', '提币审核模式：auto自动/manual人工/threshold按阈值'],
    ['withdraw_audit_threshold', '100', '提币审核阈值：低于此金额自动审核，等于或高于需人工审核（USDT）'],
    ['transfer_audit_mode', 'auto', '转账审核模式：auto自动/manual人工'],
    ['collection_audit_mode', 'auto', '归集审核模式：auto自动/manual人工'],
    ['trc20_rpc_url', 'https://api.trongrid.io', 'TRC20 主节点'],
    ['trc20_backup_rpc_url', '', 'TRC20 备用节点'],
    ['bsc_rpc_url', 'https://bsc-dataseed1.binance.org', 'BSC 主节点'],
    ['bsc_backup_rpc_url', 'https://bsc-dataseed2.binance.org', 'BSC 备用节点'],
    ['collection_threshold', '10', '归集阈值（USDT）'],
    ['collection_main_address_trc20', '', 'TRC20 归集主地址'],
    ['collection_main_address_bsc', '', 'BSC 归集主地址'],
    ['collection_cron', '0 */6 * * *', '归集定时策略'],
    ['withdraw_max_amount', '50000', '单笔提币最大金额'],
    ['withdraw_daily_limit', '200000', '每日提币限额'],
    ['blacklist_addresses', '[]', '黑名单地址（JSON数组）'],
    ['fee_payer', 'platform', '手续费承担方：platform/merchant'],
    ['trc20_confirm_blocks', '1', 'TRC20 确认区块数'],
    ['bsc_confirm_blocks', '15', 'BSC 确认区块数'],
    ['callback_max_retry', '5', '回调最大重试次数'],
    ['deposit_scan_interval', '15000', '充币扫描间隔（毫秒）'],
    ['feee_energy_enabled', '1', '能量租赁开关：1启用/0关闭'],
    ['feee_api_key', '', 'feee.io API Key'],
    ['feee_user_agent', 'feee', 'feee.io User-Agent 白名单名称'],
  ];

  for (const [key, value, desc] of configs) {
    const existing = db.prepare('SELECT id FROM system_config WHERE config_key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO system_config (config_key, config_value, description) VALUES (?, ?, ?)').run(key, value, desc);
    }
  }
  console.log('[数据库] 默认配置插入完成');

  // 创建默认管理员
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';
  const hashedPassword = bcrypt.hashSync(password, 10);
  const existingAdmin = db.prepare('SELECT id FROM admin_user WHERE username = ?').get(username);
  if (!existingAdmin) {
    db.prepare('INSERT INTO admin_user (username, password, nickname, role) VALUES (?, ?, ?, ?)').run(username, hashedPassword, '超级管理员', 'superadmin');
  }
  console.log(`[数据库] 默认管理员创建完成：${username}`);

  // 初始化扫描进度
  for (const chain of ['trc20', 'bsc']) {
    const existing = db.prepare('SELECT id FROM scan_progress WHERE chain_type = ?').get(chain);
    if (!existing) {
      db.prepare('INSERT INTO scan_progress (chain_type, last_block) VALUES (?, ?)').run(chain, 0);
    }
  }
  console.log('[数据库] 扫描进度初始化完成');

  saveToDisk();
  console.log('[数据库] ===== 数据库初始化全部完成 =====');
  process.exit(0);
}

main().catch(err => {
  console.error('[数据库] 初始化失败：', err);
  process.exit(1);
});
