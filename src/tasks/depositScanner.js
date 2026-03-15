/**
 * 充币扫描器 - 定时扫描链上充币交易
 */
const db = require('../database/db');
const chain = require('../chain');
const depositService = require('../services/depositService');
const addressService = require('../services/addressService');
const callbackService = require('../services/callbackService');
const configService = require('../services/configService');
const logger = require('../utils/logger');

/**
 * 扫描 TRC20 链上充币
 */
const scanTRC20 = async () => {
  try {
    const progressRow = db.prepare('SELECT last_block FROM scan_progress WHERE chain_type = ?').get('trc20');
    let lastBlock = progressRow?.last_block || 0;

    const currentBlock = await chain.trc20.getCurrentBlock();
    if (lastBlock === 0) lastBlock = currentBlock - 5;

    const confirmBlocks = parseInt(configService.get('trc20_confirm_blocks') || '1');
    const safeBlock = currentBlock - confirmBlocks;

    if (lastBlock >= safeBlock) return;

    logger.info('[TRC20扫描] 开始', { from: lastBlock + 1, to: safeBlock });

    for (let blockNum = lastBlock + 1; blockNum <= safeBlock; blockNum++) {
      const transfers = await chain.trc20.getBlockTransfers(blockNum);

      for (const tx of transfers) {
        const walletInfo = addressService.getByAddress(tx.toAddress);
        if (!walletInfo) continue;

        if (depositService.existsByTxid(tx.txid)) continue;

        depositService.create({
          address: tx.toAddress,
          chain_type: 'trc20',
          amount: tx.amount,
          txid: tx.txid,
          confirmations: confirmBlocks,
          merchant_id: walletInfo.merchant_id,
        });

        depositService.confirmSuccess(tx.txid);

        const order = db.prepare('SELECT * FROM deposit_order WHERE txid = ?').get(tx.txid);
        if (order) {
          const result = await callbackService.sendDepositCallback(order);
          depositService.updateCallbackStatus(order.order_no, result ? 1 : 2, 1);
        }
      }

      db.prepare(`UPDATE scan_progress SET last_block = ?, update_time = datetime('now','localtime') WHERE chain_type = ?`)
        .run(blockNum, 'trc20');
    }

    logger.info('[TRC20扫描] 完成', { scanned: safeBlock - lastBlock });
  } catch (err) {
    logger.error('[TRC20扫描] 异常', { error: err.message });
  }
};

/**
 * 扫描 BSC 链上充币
 */
const scanBSC = async () => {
  try {
    const progressRow = db.prepare('SELECT last_block FROM scan_progress WHERE chain_type = ?').get('bsc');
    let lastBlock = progressRow?.last_block || 0;

    const currentBlock = await chain.bsc.getCurrentBlock();
    if (lastBlock === 0) lastBlock = currentBlock - 5;

    const confirmBlocks = parseInt(configService.get('bsc_confirm_blocks') || '15');
    const safeBlock = currentBlock - confirmBlocks;

    if (lastBlock >= safeBlock) return;

    logger.info('[BSC扫描] 开始', { from: lastBlock + 1, to: safeBlock });

    const batchSize = 50;
    for (let from = lastBlock + 1; from <= safeBlock; from += batchSize) {
      const to = Math.min(from + batchSize - 1, safeBlock);
      const transfers = await chain.bsc.getBlockTransfers(from, to);

      for (const tx of transfers) {
        const walletInfo = addressService.getByAddress(tx.toAddress);
        if (!walletInfo) continue;

        if (depositService.existsByTxid(tx.txid)) continue;

        depositService.create({
          address: tx.toAddress,
          chain_type: 'bsc',
          amount: tx.amount,
          txid: tx.txid,
          confirmations: confirmBlocks,
          merchant_id: walletInfo.merchant_id,
        });

        depositService.confirmSuccess(tx.txid);

        const order = db.prepare('SELECT * FROM deposit_order WHERE txid = ?').get(tx.txid);
        if (order) {
          const result = await callbackService.sendDepositCallback(order);
          depositService.updateCallbackStatus(order.order_no, result ? 1 : 2, 1);
        }
      }

      db.prepare(`UPDATE scan_progress SET last_block = ?, update_time = datetime('now','localtime') WHERE chain_type = ?`)
        .run(to, 'bsc');
    }

    logger.info('[BSC扫描] 完成', { scanned: safeBlock - lastBlock });
  } catch (err) {
    logger.error('[BSC扫描] 异常', { error: err.message });
  }
};

/**
 * 通过区块浏览器 API 补扫系统地址的历史充币记录（支持手动触发）
 */
const rescanDeposits = async () => {
  const axios = require('axios');

  const addresses = db.prepare('SELECT address, chain_type, merchant_id FROM wallet_address WHERE status = 1').all();
  if (!addresses.length) return { count: 0 };

  logger.info('[补扫] 开始检查历史充币', { addressCount: addresses.length });
  let totalAdded = 0;

  for (const addr of addresses) {
    try {
      if (addr.chain_type === 'trc20') {
        const contract = process.env.TRC20_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        const { data } = await axios.get('https://api.trongrid.io/v1/accounts/' + addr.address + '/transactions/trc20', {
          params: { only_to: true, limit: 50, contract_address: contract },
          headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY || '' },
          timeout: 15000,
        });
        const txs = data?.data || [];
        for (const tx of txs) {
          // only_to=true 时返回的均为该地址收款，to 需匹配（兼容大小写）
          const toMatch = !tx.to || tx.to === addr.address || String(tx.to).toLowerCase() === String(addr.address).toLowerCase();
          if (!toMatch) continue;
          const txid = tx.transaction_id;
          if (depositService.existsByTxid(txid)) continue;
          const amount = (Number(tx.value || 0) / Math.pow(10, tx.token_info?.decimals || 6)).toString();
          depositService.create({
            address: addr.address,
            chain_type: 'trc20',
            amount,
            txid,
            confirmations: 20,
            merchant_id: addr.merchant_id,
          });
          depositService.confirmSuccess(txid);
          totalAdded++;
          logger.info('[补扫] TRC20 充币补录', { address: addr.address, txid, amount });

          const order = db.prepare('SELECT * FROM deposit_order WHERE txid = ?').get(txid);
          if (order) await callbackService.sendDepositCallback(order).catch(() => {});
        }
      } else if (addr.chain_type === 'bsc') {
        const contract = process.env.BSC_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';
        const { data } = await axios.get('https://api.bscscan.com/api', {
          params: {
            module: 'account',
            action: 'tokentx',
            contractaddress: contract,
            address: addr.address,
            sort: 'desc',
            page: 1,
            offset: 50,
          },
          timeout: 15000,
        });
        const txs = data?.result || [];
        for (const tx of txs) {
          if (tx.to?.toLowerCase() !== addr.address.toLowerCase()) continue;
          const txid = tx.hash;
          if (depositService.existsByTxid(txid)) continue;
          const amount = (Number(tx.value || 0) / 1e18).toString();
          depositService.create({
            address: addr.address,
            chain_type: 'bsc',
            amount,
            txid,
            confirmations: 15,
            merchant_id: addr.merchant_id,
          });
          depositService.confirmSuccess(txid);
          totalAdded++;
          logger.info('[补扫] BSC 充币补录', { address: addr.address, txid, amount });

          const order = db.prepare('SELECT * FROM deposit_order WHERE txid = ?').get(txid);
          if (order) await callbackService.sendDepositCallback(order).catch(() => {});
        }
      }
    } catch (err) {
      logger.error('[补扫] 失败', { address: addr.address, chain_type: addr.chain_type, error: err.message });
    }
  }

  logger.info('[补扫] 历史充币检查完成', { added: totalAdded });
  return { count: totalAdded };
};

module.exports = { scanTRC20, scanBSC, rescanDeposits };
