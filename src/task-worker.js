/**
 * 任务消费服务（独立进程）
 */
require('dotenv').config();
const { initDatabase } = require('./database/db');
const logger = require('./utils/logger');

async function start() {
  await initDatabase();
  logger.info('[TaskWorker] 数据库初始化完成');

  const { withdrawQueue, callbackQueue } = require('./tasks/queues');
  const processWithdraw = require('./tasks/withdrawProcessor');
  const callbackService = require('./services/callbackService');
  const depositService = require('./services/depositService');
  const withdrawService = require('./services/withdrawService');

  withdrawQueue.process(5, async (job) => {
    await processWithdraw(job);
  });

  callbackQueue.process(10, async (job) => {
    const { type, orderNo } = job.data;
    if (type === 'deposit') {
      const order = depositService.getByOrderNo(orderNo);
      if (order && order.callback_status !== 1) {
        const result = await callbackService.sendDepositCallback(order);
        depositService.updateCallbackStatus(orderNo, result ? 1 : 2, order.callback_times + 1);
      }
    } else if (type === 'withdraw') {
      const order = withdrawService.getByOrderNo(orderNo);
      if (order && order.callback_status !== 1) {
        const result = await callbackService.sendWithdrawCallback(order);
        withdrawService.updateCallbackStatus(orderNo, result ? 1 : 2, order.callback_times + 1);
      }
    }
  });

  logger.info('[TaskWorker] 所有队列消费者已注册');
}

start().catch(err => {
  console.error('[TaskWorker] 启动失败', err);
  process.exit(1);
});
