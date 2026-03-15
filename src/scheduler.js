/**
 * 定时任务服务（独立进程）
 */
require('dotenv').config();
const { initDatabase } = require('./database/db');
const logger = require('./utils/logger');

async function start() {
  await initDatabase();
  logger.info('[Scheduler] 数据库初始化完成');

  const cron = require('node-cron');
  const { scanTRC20, scanBSC } = require('./tasks/depositScanner');
  const { withdrawQueue, callbackQueue } = require('./tasks/queues');
  const withdrawService = require('./services/withdrawService');
  const depositService = require('./services/depositService');
  const addressService = require('./services/addressService');
  const configService = require('./services/configService');
  const db = require('./database/db');

  const scanInterval = parseInt(configService.get('deposit_scan_interval') || '30000');
  setInterval(async () => {
    try {
      await scanTRC20();
      await scanBSC();
    } catch (err) {
      logger.error('[Scheduler] 充币扫描异常', { error: err.message });
    }
  }, scanInterval);

  setInterval(() => {
    try {
      const pending = withdrawService.getPendingOrders();
      for (const order of pending) {
        withdrawQueue.add({ orderNo: order.order_no }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        });
      }
      if (pending.length > 0) {
        logger.info(`[Scheduler] 分发 ${pending.length} 笔待处理提币`);
      }
    } catch (err) {
      logger.error('[Scheduler] 提币分发异常', { error: err.message });
    }
  }, 10000);

  cron.schedule('* * * * *', () => {
    try {
      const maxRetry = parseInt(configService.get('callback_max_retry') || '5');
      const pendingDeposits = depositService.getPendingCallbackOrders();
      for (const order of pendingDeposits) {
        if (order.callback_times < maxRetry) {
          callbackQueue.add({ type: 'deposit', orderNo: order.order_no }, { removeOnComplete: true });
        }
      }
      const pendingWithdraws = db.prepare(`
        SELECT w.*, m.callback_url FROM withdraw_order w
        LEFT JOIN merchant m ON w.merchant_id = m.id
        WHERE w.status IN (1, 2) AND w.callback_status != 1 AND w.callback_times < ?
      `).all(maxRetry);
      for (const order of pendingWithdraws) {
        callbackQueue.add({ type: 'withdraw', orderNo: order.order_no }, { removeOnComplete: true });
      }
    } catch (err) {
      logger.error('[Scheduler] 回调重试异常', { error: err.message });
    }
  });

  const collectionService = require('./services/collectionService');
  const collectionCron = configService.get('collection_cron') || '0 */6 * * *';
  cron.schedule(collectionCron, async () => {
    logger.info('[Scheduler] 开始自动归集...');
    try {
      for (const chainType of ['trc20', 'bsc']) {
        collectionService.runCollection(chainType, 0);
      }
    } catch (err) {
      logger.error('[Scheduler] 自动归集异常', { error: err.message });
    }
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      const chain = require('./chain');
      const trc20Block = await chain.trc20.getCurrentBlock().catch(() => null);
      const bscBlock = await chain.bsc.getCurrentBlock().catch(() => null);
      logger.info('[节点检查]', {
        trc20: trc20Block ? `正常 (${trc20Block})` : '异常',
        bsc: bscBlock ? `正常 (${bscBlock})` : '异常',
      });
      if (!trc20Block) { chain.trc20.resetInstance(); }
      if (!bscBlock) { chain.bsc.resetInstance(); }
    } catch (err) {
      logger.error('[节点检查] 异常', { error: err.message });
    }
  });

  logger.info('[Scheduler] 所有定时任务已注册');
}

start().catch(err => {
  console.error('[Scheduler] 启动失败', err);
  process.exit(1);
});
