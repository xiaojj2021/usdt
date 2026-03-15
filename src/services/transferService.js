/**
 * 单笔转账服务
 * 从平台钱包地址转账 USDT 到指定地址
 */
const addressService = require('./addressService');
const configService = require('./configService');
const chain = require('../chain');
const logger = require('../utils/logger');

/**
 * 执行单笔转账
 * @param {string} fromAddress - 平台内钱包地址
 * @param {string} toAddress - 目标地址
 * @param {string} amount - 金额（USDT）
 */
const execute = async (fromAddress, toAddress, amount) => {
  const row = addressService.getByAddress(fromAddress);
  if (!row) throw new Error(`转出地址不存在: ${fromAddress}`);
  if (row.status !== 1) throw new Error('转出地址已禁用');

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) throw new Error('金额必须大于0');

  const realBal = await addressService.queryBalance(fromAddress);
  const balance = parseFloat(realBal.balance || 0);
  if (balance < amt) throw new Error(`余额不足，当前: ${balance} USDT`);

  const chainModule = chain.getChainModule(row.chain_type);
  const privateKey = addressService.getPrivateKey(fromAddress);

  let txid;
  if (row.chain_type === 'trc20') {
    txid = await chainModule.transferUSDT(privateKey, toAddress, amt.toString());
  } else {
    txid = await chainModule.transferUSDT(privateKey, fromAddress, toAddress, amt.toString());
  }

  addressService.queryBalance(fromAddress).catch(() => {});
  logger.info('[转账] 成功', { from: fromAddress, to: toAddress, amount: amt, txid });
  return { txid, chain_type: row.chain_type };
};

/**
 * 批量转账
 * @param {Array<{from_address,to_address,amount}>} items
 */
const batchExecute = async (items) => {
  if (!items || !items.length) throw new Error('批量转账列表不能为空');
  if (items.length > 50) throw new Error('单次最多50笔');

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const { from_address, to_address, amount } = items[i];
    try {
      const ret = await execute(from_address, to_address, amount);
      results.push({ index: i + 1, success: true, txid: ret.txid });
    } catch (err) {
      results.push({ index: i + 1, success: false, error: err.message });
    }
  }
  const successCount = results.filter(r => r.success).length;
  return { success_count: successCount, fail_count: results.length - successCount, results };
};

module.exports = { execute, batchExecute };
