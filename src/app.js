/**
 * USDT 支付中间件 - 主服务入口
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const logger = require('./utils/logger');
const { initDatabase } = require('./database/db');
const { apiLimiter } = require('./middlewares/rateLimiter');

async function startServer() {
  // 先初始化数据库
  await initDatabase();
  logger.info('[服务] 数据库初始化完成');

  const db = require('./database/db');

  // 迁移：创建 deleted_txid 表（防止已删除的充币订单被扫描器重建）
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS deleted_txid (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txid TEXT UNIQUE NOT NULL,
      order_type TEXT DEFAULT 'deposit',
      deleted_at TEXT DEFAULT (datetime('now','localtime'))
    )`);
  } catch (e) { /* 已存在则忽略 */ }

  // 迁移：TRC20 确认数改为 1（仅当当前为 20 时更新，避免覆盖用户自定义）
  const row = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get('trc20_confirm_blocks');
  if (row?.config_value === '20') {
    db.prepare('UPDATE system_config SET config_value = ? WHERE config_key = ?').run('1', 'trc20_confirm_blocks');
    logger.info('[迁移] TRC20 确认区块数已更新为 1');
  }
  const scanRow = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get('deposit_scan_interval');
  const curInterval = parseInt(scanRow?.config_value || '0');
  if (curInterval > 0 && curInterval < 60000) {
    db.prepare('UPDATE system_config SET config_value = ? WHERE config_key = ?').run('60000', 'deposit_scan_interval');
    logger.info('[迁移] 充币扫描间隔已更新为 60 秒（节约 TronGrid 额度）');
  }

  // 自动插入 feee.io 能量配置（如果不存在）
  const feeeConfigs = [
    ['feee_energy_enabled', '1', '能量租赁开关：1启用/0关闭'],
    ['feee_api_key', '', 'feee.io API Key'],
    ['feee_user_agent', 'feee', 'feee.io User-Agent 白名单名称'],
  ];
  for (const [key, value, desc] of feeeConfigs) {
    const existing = db.prepare('SELECT id FROM system_config WHERE config_key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO system_config (config_key, config_value, description) VALUES (?, ?, ?)').run(key, value, desc);
    }
  }

  // 修复：如果审核模式被 Gas 不足逻辑错误改为 manual，恢复为 auto
  const auditRow = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get('withdraw_audit_mode');
  if (auditRow?.config_value === 'manual') {
    db.prepare('UPDATE system_config SET config_value = ? WHERE config_key = ?').run('auto', 'withdraw_audit_mode');
    logger.info('[修复] 提币审核模式已恢复为 auto');
  }

  const openApiRouter = require('./routes/openApi');
  const adminApiRouter = require('./routes/adminApi');

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // HTTP 请求日志中间件
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api') || req.path.startsWith('/admin/api')) {
        logger.api.info(`${req.method} ${req.path}`, {
          status: res.statusCode,
          ms: Date.now() - start,
          ip: req.ip || req.headers['x-forwarded-for'] || '',
        });
      }
    });
    next();
  });

  // 禁止 API 响应被缓存，避免 401 被缓存后后续请求命中旧响应
  app.use('/admin/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
  });

  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  app.use('/api', apiLimiter);

  app.use('/api/v1', openApiRouter);
  app.use('/admin/api', adminApiRouter);

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/admin/api')) {
      const indexPath = path.join(__dirname, '../frontend/dist/index.html');
      if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.json({ msg: 'USDT 支付中间件 API 服务运行中。前端请先执行 cd frontend && npm run build' });
      }
    }
  });

  app.use((err, req, res, next) => {
    logger.error('[全局异常]', { error: err.message, stack: err.stack });
    res.status(500).json({ code: 500, msg: '服务器内部错误', data: null });
  });

  app.listen(PORT, () => {
    logger.info(`[服务] USDT 支付中间件已启动，端口: ${PORT}`);
    logger.info(`[服务] 管理后台: http://localhost:${PORT}`);
    logger.info(`[服务] 开放API: http://localhost:${PORT}/api/v1`);
    logger.info(`[服务] 管理API: http://localhost:${PORT}/admin/api`);

    startScheduledTasks();
  });
}

/**
 * 内置定时任务：充币扫描、提币处理、回调重试、自动归集
 */
function startScheduledTasks() {
  const { scanTRC20, scanBSC, rescanDeposits } = require('./tasks/depositScanner');
  const withdrawService = require('./services/withdrawService');
  const depositService = require('./services/depositService');
  const addressService = require('./services/addressService');
  const callbackService = require('./services/callbackService');
  const configService = require('./services/configService');
  const chain = require('./chain');
  const db = require('./database/db');

  // --- 充币区块扫描（每60秒） ---
  const scanInterval = parseInt(configService.get('deposit_scan_interval') || '60000');
  let depositCycleCount = 0;
  setInterval(async () => {
    depositCycleCount++;
    try {
      logger.deposit.info('区块扫描开始', { cycle: depositCycleCount });
      await scanTRC20();
      await scanBSC();
      logger.deposit.info('区块扫描完成', { cycle: depositCycleCount });
    } catch (err) {
      logger.deposit.error('区块扫描异常', { cycle: depositCycleCount, error: err.message });
    }
  }, scanInterval);

  // --- 提币处理（每10秒） ---
  let withdrawCycleCount = 0;
  setInterval(async () => {
    withdrawCycleCount++;
    try {
      const pending = withdrawService.getPendingOrders();
      if (pending.length > 0) {
        logger.withdraw.info('处理待提币订单', { cycle: withdrawCycleCount, count: pending.length });
      }
      for (const order of pending) {
        await processWithdrawOrder(order);
      }
      if (withdrawCycleCount % 30 === 0) {
        logger.withdraw.info('心跳 - 提币轮询正常', { cycle: withdrawCycleCount, pendingCount: pending.length });
      }
    } catch (err) {
      logger.withdraw.error('处理异常', { cycle: withdrawCycleCount, error: err.message });
    }
  }, 10000);

  // --- 回调重试（每60秒） ---
  let callbackCycleCount = 0;
  setInterval(async () => {
    callbackCycleCount++;
    try {
      const maxRetry = parseInt(configService.get('callback_max_retry') || '5');
      const pendingDeposits = depositService.getPendingCallbackOrders();
      let retried = 0;
      for (const order of pendingDeposits) {
        if (order.callback_times < maxRetry) {
          logger.callback.info('重试充币回调', { orderNo: order.order_no, attempt: order.callback_times + 1 });
          const result = await callbackService.sendDepositCallback(order);
          depositService.updateCallbackStatus(order.order_no, result ? 1 : 2, order.callback_times + 1);
          retried++;
        }
      }
      const pendingWithdraws = db.prepare(`
        SELECT w.*, m.callback_url FROM withdraw_order w
        LEFT JOIN merchant m ON w.merchant_id = m.id
        WHERE w.status IN (1, 2) AND w.callback_status != 1 AND w.callback_times < ?
      `).all(maxRetry);
      for (const order of pendingWithdraws) {
        logger.callback.info('重试提币回调', { orderNo: order.order_no, attempt: order.callback_times + 1 });
        const result = await callbackService.sendWithdrawCallback(order);
        withdrawService.updateCallbackStatus(order.order_no, result ? 1 : 2, order.callback_times + 1);
        retried++;
      }
      logger.callback.info('回调轮询完成', { cycle: callbackCycleCount, retried, pendingDeposit: pendingDeposits.length, pendingWithdraw: pendingWithdraws.length });
    } catch (err) {
      logger.callback.error('回调重试异常', { cycle: callbackCycleCount, error: err.message });
    }
  }, 60000);

  // --- 自动归集（每6小时） ---
  const collectionService = require('./services/collectionService');
  const cronExpr = configService.get('collection_cron') || '0 */6 * * *';
  try {
    const cron = require('node-cron');
    cron.schedule(cronExpr, async () => {
      logger.collection.info('自动归集任务触发');
      try {
        for (const chainType of ['trc20', 'bsc']) {
          logger.collection.info(`开始归集 ${chainType.toUpperCase()}`);
          const result = await collectionService.runCollection(chainType, 0);
          logger.collection.info(`${chainType.toUpperCase()} 归集完成`, { success: result.success_count, fail: result.fail_count });
        }
        logger.collection.info('自动归集任务结束');
      } catch (err) {
        logger.collection.error('自动归集异常', { error: err.message });
      }
    });
  } catch (e) {
    logger.collection.error('cron 初始化失败', { error: e.message });
  }

  // --- 心跳日志：每5分钟输出服务状态 ---
  setInterval(() => {
    const uptime = Math.floor(process.uptime());
    const mem = process.memoryUsage();
    logger.info('[心跳] 服务运行中', {
      uptime: `${Math.floor(uptime / 3600)}h${Math.floor((uptime % 3600) / 60)}m`,
      rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
      heap: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}/${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`,
      depositCycles: depositCycleCount,
      withdrawCycles: withdrawCycleCount,
      callbackCycles: callbackCycleCount,
    });
  }, 5 * 60 * 1000);

  logger.info('[服务] 定时任务已全部启动', {
    tasks: ['充币区块扫描', '提币处理', '回调重试', '自动归集', '服务心跳'],
    scanInterval: `${scanInterval}ms`,
    collectionCron: cronExpr,
  });
}

/**
 * 处理单笔提币订单
 */
async function processWithdrawOrder(order) {
  const withdrawService = require('./services/withdrawService');
  const addressService = require('./services/addressService');
  const callbackService = require('./services/callbackService');
  const chain = require('./chain');
  const db = require('./database/db');

  const freshOrder = withdrawService.getByOrderNo(order.order_no);
  if (!freshOrder || freshOrder.status !== 0) return;

  logger.withdraw.info('开始处理', { orderNo: order.order_no, chain: order.chain_type, to: order.to_address, amount: order.amount });

  try {
    const chainModule = chain.getChainModule(order.chain_type);

    let fromAddress = addressService.getMainAddress(order.merchant_id, order.chain_type);
    if (!fromAddress) {
      const configKey = `collection_main_address_${order.chain_type}`;
      const mainAddrRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get(configKey);
      fromAddress = mainAddrRow?.config_value?.trim();
    }
    if (!fromAddress) {
      const anyMain = db.prepare('SELECT address FROM wallet_address WHERE chain_type = ? AND is_main = 1 AND status = 1 LIMIT 1')
        .get(order.chain_type);
      fromAddress = anyMain?.address || order.from_address;
    }
    if (!fromAddress) {
      const msg = '未配置出款地址：请在 地址管理 中为该商户(merchant_id=' + order.merchant_id + ')的' + order.chain_type.toUpperCase() + ' 设为主地址，或在 系统配置-归集配置 中填写归集主地址';
      logger.withdraw.warn('出款地址不可用', { merchant_id: order.merchant_id, chain_type: order.chain_type });
      throw new Error(msg);
    }

    logger.withdraw.info('使用出款地址', { orderNo: order.order_no, from: fromAddress });

    if (order.chain_type === 'bsc') {
      const bnbBalance = parseFloat(await chainModule.getBNBBalance(fromAddress));
      logger.chain.info('查询 BNB Gas', { address: fromAddress, balance: bnbBalance });
      if (bnbBalance < 0.001) {
        const gasMsg = `手续费不足：BNB 余额 ${bnbBalance}，至少需要 0.001 BNB`;
        logger.withdraw.warn('Gas 不足，跳过', { orderNo: order.order_no, bnb: bnbBalance });
        throw new Error(gasMsg);
      }
    }

    if (order.chain_type === 'trc20') {
      const energyService = require('./services/energyService');
      logger.chain.info('租赁能量', { orderNo: order.order_no, address: fromAddress });
      await energyService.rentAndWait(fromAddress);
    }

    const privateKey = addressService.getPrivateKey(fromAddress);
    logger.chain.info('发起链上转账', { orderNo: order.order_no, chain: order.chain_type, from: fromAddress, to: order.to_address, amount: order.amount });

    let txid;
    if (order.chain_type === 'trc20') {
      txid = await chainModule.transferUSDT(privateKey, order.to_address, order.amount);
    } else {
      txid = await chainModule.transferUSDT(privateKey, fromAddress, order.to_address, order.amount);
    }

    withdrawService.updateChainStatus(order.order_no, txid, 1);
    logger.withdraw.info('提币成功', { orderNo: order.order_no, txid, chain: order.chain_type });
    logger.chain.info('转账上链成功', { orderNo: order.order_no, txid });

    const updatedOrder = withdrawService.getByOrderNo(order.order_no);
    await callbackService.sendWithdrawCallback(updatedOrder);
  } catch (err) {
    logger.withdraw.error('提币失败', { orderNo: order.order_no, error: err.message, retry: order.retry_count });
    withdrawService.incrementRetry(order.order_no);
    if (order.retry_count < 3) {
      withdrawService.updateChainStatus(order.order_no, '', 0, err.message);
    } else {
      logger.withdraw.error('达到最大重试，标记失败', { orderNo: order.order_no });
      withdrawService.updateChainStatus(order.order_no, '', 2, err.message);
      const failedOrder = withdrawService.getByOrderNo(order.order_no);
      await callbackService.sendWithdrawCallback(failedOrder);
    }
  }
}

startServer().catch(err => {
  console.error('[启动失败]', err);
  process.exit(1);
});
