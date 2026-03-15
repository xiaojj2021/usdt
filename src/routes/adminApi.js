/**
 * 管理后台 API 路由
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { adminAuth } = require('../middlewares/auth');
const { success, error, pageResult } = require('../utils/response');
const db = require('../database/db');
const merchantService = require('../services/merchantService');
const addressService = require('../services/addressService');
const depositService = require('../services/depositService');
const withdrawService = require('../services/withdrawService');
const configService = require('../services/configService');
const logService = require('../services/logService');
const collectionService = require('../services/collectionService');

// ========== 登录 ==========

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json(error('请输入账号密码'));

    const user = db.prepare('SELECT * FROM admin_user WHERE username = ?').get(username);
    if (!user) return res.json(error('账号不存在'));
    if (user.status !== 1) return res.json(error('账号已禁用'));
    if (!bcrypt.compareSync(password, user.password)) return res.json(error('密码错误'));

    db.prepare(`UPDATE admin_user SET last_login_time = datetime('now','localtime') WHERE id = ?`).run(user.id);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'default-jwt-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logService.write('operate', '系统', '登录', `管理员 ${username} 登录`, req.ip, username);
    res.json(success({ token, username: user.username, nickname: user.nickname, role: user.role }));
  } catch (err) {
    res.json(error(err.message));
  }
});

// OPTIONS 预检请求不走鉴权（浏览器 CORS 预检不带 Authorization）
router.options('*', (req, res) => res.sendStatus(204));

router.use(adminAuth);

// ========== 控制台 ==========

router.get('/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const depositToday = db.prepare(`
      SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) as total FROM deposit_order WHERE status = 1 AND create_time >= ?
    `).get(today);

    const withdrawToday = db.prepare(`
      SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) as total FROM withdraw_order WHERE status = 1 AND create_time >= ?
    `).get(today);

    const pendingAudit = db.prepare(`
      SELECT COUNT(*) as count FROM withdraw_order WHERE audit_status = 0
    `).get();

    const recentDeposits = db.prepare(`SELECT * FROM deposit_order ORDER BY id DESC LIMIT 10`).all();
    const recentWithdraws = db.prepare(`SELECT * FROM withdraw_order ORDER BY id DESC LIMIT 10`).all();
    const merchantCount = db.prepare(`SELECT COUNT(*) as count FROM merchant WHERE status = 1`).get();
    const addressCount = db.prepare(`SELECT COUNT(*) as count FROM wallet_address WHERE status = 1`).get();

    res.json(success({
      deposit_today: depositToday.total,
      withdraw_today: withdrawToday.total,
      pending_audit_count: pendingAudit.count,
      merchant_count: merchantCount.count,
      address_count: addressCount.count,
      recent_deposits: recentDeposits,
      recent_withdraws: recentWithdraws,
    }));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 商户管理 ==========

router.get('/merchant/list', (req, res) => {
  const { page = 1, page_size = 20, ...filters } = req.query;
  const result = merchantService.list(page, page_size, filters);
  res.json(pageResult(result.list, result.total, page, page_size));
});

router.post('/merchant/create', (req, res) => {
  try {
    const result = merchantService.create(req.body);
    logService.write('operate', '商户管理', '新增', JSON.stringify(req.body), req.ip, req.admin.username);
    res.json(success(result, '商户创建成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/merchant/update', (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) return res.json(error('缺少商户ID'));
    merchantService.update(id, data);
    logService.write('operate', '商户管理', '编辑', JSON.stringify(req.body), req.ip, req.admin.username);
    res.json(success(null, '更新成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/merchant/reset-keys', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json(error('缺少商户ID'));
    const result = merchantService.resetKeys(id);
    logService.write('operate', '商户管理', '重置密钥', `商户 ${id}`, req.ip, req.admin.username);
    res.json(success(result, '密钥已重置'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/merchant/disable', (req, res) => {
  const { id } = req.body;
  merchantService.disable(id);
  logService.write('operate', '商户管理', '禁用', `商户 ${id}`, req.ip, req.admin.username);
  res.json(success(null, '已禁用'));
});

router.post('/merchant/enable', (req, res) => {
  const { id } = req.body;
  merchantService.enable(id);
  logService.write('operate', '商户管理', '启用', `商户 ${id}`, req.ip, req.admin.username);
  res.json(success(null, '已启用'));
});

router.get('/merchant/detail', (req, res) => {
  const merchant = merchantService.getById(req.query.id);
  if (!merchant) return res.json(error('商户不存在'));
  res.json(success(merchant));
});

// ========== 地址管理 ==========

router.get('/address/list', async (req, res) => {
  try {
    const { page = 1, page_size = 20, refresh, ...filters } = req.query;
    const refreshOnChain = refresh === '1';
    const result = await addressService.list(page, page_size, filters, refreshOnChain);
    res.json(pageResult(result.list, result.total, page, page_size));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/address/generate', async (req, res) => {
  try {
    const { chain_type, merchant_id, user_id, set_as_main } = req.body;
    if (!chain_type || !merchant_id) return res.json(error('缺少参数'));
    const result = await addressService.generate(chain_type, merchant_id, user_id, !!set_as_main);
    logService.write('operate', '地址管理', '生成', JSON.stringify(result), req.ip, req.admin.username);
    res.json(success(result, '地址生成成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/address/batch-generate', async (req, res) => {
  try {
    const { chain_type, merchant_id, count, set_first_as_main } = req.body;
    if (!chain_type || !merchant_id || !count) return res.json(error('缺少参数'));
    const result = await addressService.batchGenerate(chain_type, merchant_id, parseInt(count), [], !!set_first_as_main);
    res.json(success(result, `生成 ${result.length} 个地址`));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/address/set-main', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json(error('缺少地址ID'));
    addressService.setMainAddress(id);
    logService.write('operate', '地址管理', '设为主地址', `ID: ${id}`, req.ip, req.admin.username);
    res.json(success(null, '已设为主地址'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/address/cancel-main', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json(error('缺少地址ID'));
    addressService.cancelMainAddress(id);
    logService.write('operate', '地址管理', '取消主地址', `ID: ${id}`, req.ip, req.admin.username);
    res.json(success(null, '已取消主地址'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/address/disable', (req, res) => {
  addressService.disable(req.body.id);
  res.json(success(null, '地址已禁用'));
});

router.get('/address/balance', async (req, res) => {
  try {
    const result = await addressService.queryBalance(req.query.address);
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 充币订单 ==========

router.get('/deposit/list', (req, res) => {
  const { page = 1, page_size = 20, ...filters } = req.query;
  const result = depositService.list(page, page_size, filters);
  res.json(pageResult(result.list, result.total, page, page_size));
});

router.get('/deposit/detail', (req, res) => {
  const order = depositService.getByOrderNo(req.query.order_no);
  if (!order) return res.json(error('订单不存在'));
  res.json(success(order));
});

router.post('/deposit/resend-callback', async (req, res) => {
  try {
    const order = depositService.getByOrderNo(req.body.order_no);
    if (!order) return res.json(error('订单不存在'));
    const callbackService = require('../services/callbackService');
    const result = await callbackService.sendDepositCallback(order);
    depositService.updateCallbackStatus(order.order_no, result ? 1 : 2, order.callback_times + 1);
    res.json(success(null, result ? '回调发送成功' : '回调发送失败'));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 标记已回调：当确认商户已收到回调但系统未记录时，手动标记为已回调 */
router.post('/deposit/mark-callback-success', (req, res) => {
  try {
    const order = depositService.getByOrderNo(req.body.order_no);
    if (!order) return res.json(error('订单不存在'));
    if (order.callback_status === 1) return res.json(success(null, '已是已回调状态'));
    depositService.updateCallbackStatus(order.order_no, 1, (order.callback_times || 0) + 1);
    logService.write('operate', '充币', '标记已回调', order.order_no, req.ip, req.admin?.username || '');
    res.json(success(null, '已标记为已回调'));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 手动补扫充币：通过 API 重新检查所有地址的历史充币 */
router.post('/deposit/rescan', async (req, res) => {
  try {
    const { rescanDeposits } = require('../tasks/depositScanner');
    const result = await rescanDeposits();
    logService.write('operate', '充币', '手动补扫', `补录 ${result.count} 笔`, req.ip, req.admin.username);
    res.json(success(result, `补扫完成，新增 ${result.count} 笔充币`));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 批量删除充币订单（记录 txid 防止扫描器重建） */
router.post('/deposit/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json(error('缺少订单ID'));
    const selectStmt = db.prepare('SELECT txid FROM deposit_order WHERE id = ?');
    const insertDeleted = db.prepare('INSERT OR IGNORE INTO deleted_txid (txid, order_type) VALUES (?, ?)');
    const deleteStmt = db.prepare('DELETE FROM deposit_order WHERE id = ?');
    for (const id of ids) {
      const row = selectStmt.get(id);
      if (row?.txid) insertDeleted.run(row.txid, 'deposit');
      deleteStmt.run(id);
    }
    logService.write('operate', '充币', '批量删除', `删除 ${ids.length} 笔`, req.ip, req.admin.username);
    res.json(success(null, `已删除 ${ids.length} 笔`));
  } catch (err) { res.json(error(err.message)); }
});

// ========== 提币订单 ==========

router.get('/withdraw/list', (req, res) => {
  const { page = 1, page_size = 20, ...filters } = req.query;
  const result = withdrawService.list(page, page_size, filters);
  res.json(pageResult(result.list, result.total, page, page_size));
});

router.get('/withdraw/detail', (req, res) => {
  const order = withdrawService.getByOrderNo(req.query.order_no);
  if (!order) return res.json(error('订单不存在'));
  res.json(success(order));
});

/** 批量删除提币订单 */
router.post('/withdraw/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json(error('缺少订单ID'));
    const stmt = db.prepare('DELETE FROM withdraw_order WHERE id = ?');
    for (const id of ids) stmt.run(id);
    logService.write('operate', '提币', '批量删除', `删除 ${ids.length} 笔`, req.ip, req.admin.username);
    res.json(success(null, `已删除 ${ids.length} 笔`));
  } catch (err) { res.json(error(err.message)); }
});

// ========== 审核中心 ==========

router.get('/audit/pending', (req, res) => {
  try {
    const data = { withdraw_orders: withdrawService.getPendingAuditOrders() };
    res.json(success(data));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/audit/withdraw/approve', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json(error('缺少订单ID'));
    for (const id of ids) {
      withdrawService.approve(id, req.admin.username);
    }
    logService.write('operate', '审核中心', '提币通过', `订单 ${ids.join(',')}`, req.ip, req.admin.username);
    res.json(success(null, `已通过 ${ids.length} 笔`));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/audit/withdraw/reject', (req, res) => {
  try {
    const { ids, remark } = req.body;
    if (!ids || !ids.length) return res.json(error('缺少订单ID'));
    for (const id of ids) {
      withdrawService.reject(id, req.admin.username, remark || '');
    }
    logService.write('operate', '审核中心', '提币驳回', `订单 ${ids.join(',')}，原因：${remark}`, req.ip, req.admin.username);
    res.json(success(null, `已驳回 ${ids.length} 笔`));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 转账 ==========

router.post('/transfer/execute', async (req, res) => {
  try {
    const { from_address, to_address, amount } = req.body;
    if (!from_address || !to_address || !amount) return res.json(error('缺少参数：from_address、to_address、amount'));
    const transferService = require('../services/transferService');
    const result = await transferService.execute(from_address, to_address, amount);
    logService.write('operate', '转账', '执行', JSON.stringify({ from_address, to_address, amount, txid: result.txid }), req.ip, req.admin.username);
    res.json(success(result, '转账成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/transfer/batch-execute', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.json(error('缺少参数：items 数组'));
    if (items.length > 100) return res.json(error('单次最多 100 笔'));
    const transferService = require('../services/transferService');
    const result = await transferService.batchExecute(items);
    logService.write('operate', '批量转账', '执行', JSON.stringify(result), req.ip, req.admin.username);
    res.json(success(result, `成功 ${result.success_count} 笔，失败 ${result.fail_count} 笔`));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 手动归集 ==========

router.post('/collection/manual', async (req, res) => {
  try {
    const { chain_type, merchant_id } = req.body;
    const chainType = chain_type || 'trc20';
    if (!['trc20', 'bsc'].includes(chainType)) return res.json(error('链类型无效'));
    const result = await collectionService.runCollection(chainType, merchant_id ? parseInt(merchant_id) : 0);
    logService.write('operate', '归集', '手动归集', JSON.stringify({ chain_type: chainType, merchant_id, count: result.count }), req.ip, req.admin.username);
    res.json(success(result, result.message));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 归集日志：返回最近的归集相关日志 */
router.get('/collection/logs', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '../../logs/combined.log');
    if (!fs.existsSync(logPath)) return res.json(success([]));
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(l => l.includes('[归集]') || l.includes('[自动归集]'));
    res.json(success(lines.slice(-50)));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 主地址 Gas 余额查询 */
router.get('/address/gas-balance', async (req, res) => {
  try {
    const chain = require('../chain');
    const mainAddresses = db.prepare('SELECT address, chain_type, merchant_id FROM wallet_address WHERE is_main = 1 AND status = 1').all();
    const results = [];
    for (const addr of mainAddresses) {
      let gas = '0';
      let usdtBalance = '0';
      try {
        if (addr.chain_type === 'trc20') {
          gas = await chain.trc20.getTRXBalance(addr.address);
        } else if (addr.chain_type === 'bsc') {
          gas = await chain.bsc.getBNBBalance(addr.address);
        }
      } catch (e) { /* ignore */ }
      try {
        const balResult = await addressService.queryBalance(addr.address);
        usdtBalance = balResult.balance || '0';
      } catch (e) {
        const cached = db.prepare('SELECT balance FROM wallet_address WHERE address = ?').get(addr.address);
        usdtBalance = cached?.balance || '0';
      }
      results.push({
        address: addr.address,
        chain_type: addr.chain_type,
        merchant_id: addr.merchant_id,
        usdt_balance: usdtBalance,
        gas_balance: gas,
        gas_token: addr.chain_type === 'trc20' ? 'TRX' : 'BNB',
        gas_sufficient: addr.chain_type === 'trc20' ? parseFloat(gas) >= 15 : parseFloat(gas) >= 0.001,
      });
    }
    res.json(success(results));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 批量刷新所有地址余额 */
router.post('/address/refresh-all', async (req, res) => {
  try {
    const addresses = db.prepare('SELECT address FROM wallet_address WHERE status = 1').all();
    let updated = 0;
    for (const a of addresses) {
      try {
        await addressService.queryBalance(a.address);
        updated++;
      } catch (e) { /* skip */ }
    }
    res.json(success({ updated }, `已刷新 ${updated} 个地址余额`));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 能量租赁 ==========

router.get('/energy/balance', async (req, res) => {
  try {
    const energyService = require('../services/energyService');
    const result = await energyService.queryBalance();
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 系统配置 ==========

router.get('/config/list', (req, res) => {
  const configs = configService.getAll();
  res.json(success(configs));
});

router.post('/config/update', (req, res) => {
  try {
    const { configs } = req.body;
    if (!configs || !configs.length) return res.json(error('缺少配置数据'));
    configService.batchUpdate(configs);
    logService.write('operate', '系统配置', '更新', JSON.stringify(configs), req.ip, req.admin.username);
    res.json(success(null, '配置更新成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== API 文档 ==========

router.get('/doc', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const docPath = path.join(__dirname, '../../docs/API商户对接文档.md');
    if (!fs.existsSync(docPath)) return res.json(error('文档不存在'));
    const content = fs.readFileSync(docPath, 'utf8');
    res.json(success({ content }));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 日志中心 ==========

router.get('/log/list', (req, res) => {
  const { page = 1, page_size = 20, ...filters } = req.query;
  const result = logService.list(page, page_size, filters);
  res.json(pageResult(result.list, result.total, page, page_size));
});

/** 实时日志文件列表 */
router.get('/log/files', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const logDir = path.resolve('./logs');
    if (!fs.existsSync(logDir)) return res.json(success([]));
    const files = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const stat = fs.statSync(path.join(logDir, f));
        return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json(success(files));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 读取指定日志文件（最新 N 行） */
router.get('/log/read', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { file = 'combined.log', lines = 200, keyword = '' } = req.query;
    const safeName = path.basename(file);
    if (!safeName.endsWith('.log')) return res.json(error('仅支持 .log 文件'));
    const logPath = path.join(path.resolve('./logs'), safeName);
    if (!fs.existsSync(logPath)) return res.json(success({ file: safeName, lines: [], total: 0 }));

    const content = fs.readFileSync(logPath, 'utf8');
    let allLines = content.split('\n').filter(l => l.trim());
    const total = allLines.length;
    if (keyword) {
      allLines = allLines.filter(l => l.toLowerCase().includes(keyword.toLowerCase()));
    }
    const result = allLines.slice(-parseInt(lines));
    res.json(success({ file: safeName, lines: result, total, filtered: result.length }));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 清空指定日志文件 */
router.post('/log/clear', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { file } = req.body;
    if (!file) return res.json(error('缺少文件名'));
    const safeName = path.basename(file);
    if (!safeName.endsWith('.log')) return res.json(error('仅支持 .log 文件'));
    const logPath = path.join(path.resolve('./logs'), safeName);
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '');
    }
    logService.write('operate', '日志', '清空', `清空 ${safeName}`, req.ip, req.admin.username);
    res.json(success(null, `已清空 ${safeName}`));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 修改密码 ==========

router.post('/change-password', (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM admin_user WHERE id = ?').get(req.admin.id);
    if (!bcrypt.compareSync(old_password, user.password)) return res.json(error('原密码错误'));
    const hashed = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE admin_user SET password = ? WHERE id = ?').run(hashed, req.admin.id);
    res.json(success(null, '密码修改成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

module.exports = router;
