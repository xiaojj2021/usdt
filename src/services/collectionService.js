/**
 * 归集服务
 * 子地址归集到主地址，主地址优先从 wallet_address.is_main 获取，否则用系统配置
 * 直接执行链上转账，不依赖批量任务模块
 */
const db = require('../database/db');
const addressService = require('./addressService');
const configService = require('./configService');
const energyService = require('./energyService');
const chain = require('../chain');
const logger = require('../utils/logger');

/**
 * 执行归集（自动或手动触发）
 * @param {string} chainType - trc20/bsc
 * @param {number} merchantId - 可选，指定商户；0 表示全部
 */
const runCollection = async (chainType, merchantId = 0) => {
  const threshold = parseFloat(configService.get('collection_threshold') || '10');
  const sysMainTrc20 = configService.get('collection_main_address_trc20') || '';
  const sysMainBsc = configService.get('collection_main_address_bsc') || '';

  logger.collection.info('开始执行', { chain: chainType, merchant: merchantId || '全部', threshold });

  const toRefresh = db.prepare(`
    SELECT address FROM wallet_address
    WHERE chain_type = ? AND status = 1 AND (is_main = 0 OR is_main IS NULL)
  `).all(chainType);

  logger.collection.info('刷新子地址余额', { count: toRefresh.length, chain: chainType });
  for (const row of toRefresh) {
    try {
      await addressService.queryBalance(row.address);
    } catch (e) {
      logger.collection.warn('刷新余额失败，使用缓存', { address: row.address, error: e.message });
    }
  }

  const addresses = addressService.getAddressesWithBalance(chainType, threshold);
  if (addresses.length === 0) {
    logger.collection.info('无可归集地址', { chain: chainType, threshold });
    return { success: true, message: '无可归集地址', count: 0, success_count: 0, fail_count: 0 };
  }

  logger.collection.info('找到可归集地址', { chain: chainType, count: addresses.length });

  const itemsByMain = {};
  for (const a of addresses) {
    const mid = a.merchant_id;
    if (merchantId && merchantId !== mid) continue;

    let mainAddr = addressService.getMainAddress(mid, chainType);
    if (!mainAddr) {
      mainAddr = chainType === 'trc20' ? sysMainTrc20 : sysMainBsc;
    }
    if (!mainAddr || mainAddr === a.address) continue;

    const key = `${mid}_${mainAddr}`;
    if (!itemsByMain[key]) itemsByMain[key] = { mainAddr, items: [] };
    itemsByMain[key].items.push({ from_address: a.address, to_address: mainAddr, amount: a.balance });
  }

  const chainModule = chain.getChainModule(chainType);
  let successCount = 0;
  let failCount = 0;

  for (const { mainAddr, items } of Object.values(itemsByMain)) {
    logger.collection.info('归集目标', { mainAddr, subCount: items.length, chain: chainType });
    for (const item of items) {
      try {
        if (chainType === 'trc20') {
          logger.chain.info('归集租赁能量', { from: item.from_address });
          await energyService.rentAndWait(item.from_address);
        }
        const privateKey = addressService.getPrivateKey(item.from_address);
        logger.chain.info('归集链上转账', { from: item.from_address, to: mainAddr, amount: item.amount, chain: chainType });
        let txid;
        if (chainType === 'trc20') {
          txid = await chainModule.transferUSDT(privateKey, item.to_address, item.amount);
        } else {
          txid = await chainModule.transferUSDT(privateKey, item.from_address, item.to_address, item.amount);
        }
        successCount++;
        db.prepare(`UPDATE wallet_address SET balance = '0' WHERE address = ?`).run(item.from_address);
        logger.collection.info('归集成功', { chain: chainType, from: item.from_address, to: mainAddr, amount: item.amount, txid });
      } catch (err) {
        failCount++;
        logger.collection.error('归集失败', { chain: chainType, from: item.from_address, to: mainAddr, amount: item.amount, error: err.message });
      }
    }
  }

  const totalCount = successCount + failCount;
  logger.collection.info('归集批次完成', { chain: chainType, total: totalCount, success: successCount, fail: failCount });
  return {
    success: true,
    message: `归集完成，成功 ${successCount} 笔${failCount > 0 ? `，失败 ${failCount} 笔` : ''}`,
    count: totalCount,
    success_count: successCount,
    fail_count: failCount,
  };
};

module.exports = { runCollection };
