/**
 * 提币任务处理器
 */
const withdrawService = require('../services/withdrawService');
const addressService = require('../services/addressService');
const callbackService = require('../services/callbackService');
const chain = require('../chain');
const logger = require('../utils/logger');

const processWithdraw = async (job) => {
  const { orderNo } = job.data;
  const order = withdrawService.getByOrderNo(orderNo);
  if (!order || order.status !== 0) return;

  logger.info('[提币处理] 开始', { orderNo, to: order.to_address, amount: order.amount });

  try {
    const chainModule = chain.getChainModule(order.chain_type);

    // 选择出款地址：优先商户主地址，否则系统配置，最后链上任意主地址
    const db = require('../database/db');
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
    if (!fromAddress) throw new Error('未配置出款地址');

    const privateKey = addressService.getPrivateKey(fromAddress);

    let txid;
    if (order.chain_type === 'trc20') {
      txid = await chainModule.transferUSDT(privateKey, order.to_address, order.amount);
    } else {
      txid = await chainModule.transferUSDT(privateKey, fromAddress, order.to_address, order.amount);
    }

    withdrawService.updateChainStatus(orderNo, txid, 1);
    logger.info('[提币处理] 成功', { orderNo, txid });

    const updatedOrder = withdrawService.getByOrderNo(orderNo);
    await callbackService.sendWithdrawCallback(updatedOrder);
  } catch (err) {
    logger.error('[提币处理] 失败', { orderNo, error: err.message });
    withdrawService.incrementRetry(orderNo);

    if (order.retry_count < 3) {
      withdrawService.updateChainStatus(orderNo, '', 0, err.message);
    } else {
      withdrawService.updateChainStatus(orderNo, '', 2, err.message);
      const failedOrder = withdrawService.getByOrderNo(orderNo);
      await callbackService.sendWithdrawCallback(failedOrder);
    }
  }
};

module.exports = processWithdraw;
