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

  // 迁移：TRC20 确认数改为 1（仅当当前为 20 时更新，避免覆盖用户自定义）
  const db = require('./database/db');
  const row = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get('trc20_confirm_blocks');
  if (row?.config_value === '20') {
    db.prepare('UPDATE system_config SET config_value = ? WHERE config_key = ?').run('1', 'trc20_confirm_blocks');
    logger.info('[迁移] TRC20 确认区块数已更新为 1');
  }
  const scanRow = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get('deposit_scan_interval');
  if (scanRow?.config_value === '30000') {
    db.prepare('UPDATE system_config SET config_value = ? WHERE config_key = ?').run('15000', 'deposit_scan_interval');
    logger.info('[迁移] 充币扫描间隔已更新为 15 秒（1分钟内入账）');
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

  // --- 首次启动：补扫历史充币 ---
  rescanDeposits().catch(err => logger.error('[补扫] 异常', { error: err.message }));

  // --- 充币扫描（每15秒，1分钟内入账）- 按区块 + 按地址 双通道 ---
  const scanInterval = parseInt(configService.get('deposit_scan_interval') || '15000');
  setInterval(async () => {
    try {
      await scanTRC20();
      await scanBSC();
    } catch (err) {
      logger.error('[充币扫描] 异常', { error: err.message });
    }
  }, scanInterval);

  // --- 按地址扫描（每30秒）- TronGrid/BSCScan API 按地址查收款，比按区块解析更可靠 ---
  setInterval(async () => {
    try {
      const r = await rescanDeposits();
      if (r.count > 0) logger.info('[地址扫描] 发现充币', { count: r.count });
    } catch (err) {
      logger.error('[地址扫描] 异常', { error: err.message });
    }
  }, scanInterval);

  // --- 提币处理（每10秒） ---
  setInterval(async () => {
    try {
      const pending = withdrawService.getPendingOrders();
      for (const order of pending) {
        await processWithdrawOrder(order);
      }
    } catch (err) {
      logger.error('[提币处理] 异常', { error: err.message });
    }
  }, 10000);

  // --- 回调重试（每60秒） ---
  setInterval(async () => {
    try {
      const maxRetry = parseInt(configService.get('callback_max_retry') || '5');
      const pendingDeposits = depositService.getPendingCallbackOrders();
      for (const order of pendingDeposits) {
        if (order.callback_times < maxRetry) {
          const result = await callbackService.sendDepositCallback(order);
          depositService.updateCallbackStatus(order.order_no, result ? 1 : 2, order.callback_times + 1);
        }
      }
      const pendingWithdraws = db.prepare(`
        SELECT w.*, m.callback_url FROM withdraw_order w
        LEFT JOIN merchant m ON w.merchant_id = m.id
        WHERE w.status IN (1, 2) AND w.callback_status != 1 AND w.callback_times < ?
      `).all(maxRetry);
      for (const order of pendingWithdraws) {
        const result = await callbackService.sendWithdrawCallback(order);
        withdrawService.updateCallbackStatus(order.order_no, result ? 1 : 2, order.callback_times + 1);
      }
    } catch (err) {
      logger.error('[回调重试] 异常', { error: err.message });
    }
  }, 60000);

  // --- 自动归集（每6小时） ---
  const collectionService = require('./services/collectionService');
  const cronExpr = configService.get('collection_cron') || '0 */6 * * *';
  try {
    const cron = require('node-cron');
    cron.schedule(cronExpr, async () => {
      logger.info('[自动归集] 开始');
      try {
        for (const chainType of ['trc20', 'bsc']) {
          await collectionService.runCollection(chainType, 0);
        }
      } catch (err) {
        logger.error('[自动归集] 异常', { error: err.message });
      }
    });
  } catch (e) {
    logger.error('[自动归集] cron 初始化失败', { error: e.message });
  }

  logger.info('[服务] 内置定时任务已启动（充币扫描、提币处理、回调重试、自动归集）');
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

  // 重新读取最新状态，避免处理已完成/已失败的订单
  const freshOrder = withdrawService.getByOrderNo(order.order_no);
  if (!freshOrder || freshOrder.status !== 0) return;

  logger.info('[提币处理] 开始', { orderNo: order.order_no, to: order.to_address, amount: order.amount });

  try {
    const chainModule = chain.getChainModule(order.chain_type);

    // 优先用地址管理中的主地址(is_main)：先按商户查，再按系统配置，最后按链上任意主地址
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
      logger.warn('[提币] 出款地址不可用', { merchant_id: order.merchant_id, chain_type: order.chain_type });
      throw new Error(msg);
    }

    if (order.chain_type === 'bsc') {
      const bnbBalance = parseFloat(await chainModule.getBNBBalance(fromAddress));
      if (bnbBalance < 0.001) {
        const gasMsg = `手续费不足：BNB 余额 ${bnbBalance}，至少需要 0.001 BNB`;
        logger.warn('[提币处理] Gas 不足，跳过本次', { orderNo: order.order_no, reason: gasMsg });
        throw new Error(gasMsg);
      }
    }

    if (order.chain_type === 'trc20') {
      const energyService = require('./services/energyService');
      await energyService.rentAndWait(fromAddress);
    }

    const privateKey = addressService.getPrivateKey(fromAddress);
    let txid;
    if (order.chain_type === 'trc20') {
      txid = await chainModule.transferUSDT(privateKey, order.to_address, order.amount);
    } else {
      txid = await chainModule.transferUSDT(privateKey, fromAddress, order.to_address, order.amount);
    }

    withdrawService.updateChainStatus(order.order_no, txid, 1);
    logger.info('[提币处理] 成功', { orderNo: order.order_no, txid });

    const updatedOrder = withdrawService.getByOrderNo(order.order_no);
    await callbackService.sendWithdrawCallback(updatedOrder);
  } catch (err) {
    logger.error('[提币处理] 失败', { orderNo: order.order_no, error: err.message });
    withdrawService.incrementRetry(order.order_no);
    if (order.retry_count < 3) {
      withdrawService.updateChainStatus(order.order_no, '', 0, err.message);
    } else {
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
