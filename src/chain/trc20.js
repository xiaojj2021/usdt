/**
 * TRC20 链交互封装
 * 地址生成、USDT 转账、余额查询（RPC 直查合约）、交易监听
 */
const TronWeb = require('tronweb');
const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../database/db');

let tronWebInstance = null;

const getTronWeb = () => {
  if (tronWebInstance) return tronWebInstance;

  const configRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('trc20_rpc_url');
  const fullHost = configRow?.config_value || process.env.TRON_FULL_HOST || 'https://api.trongrid.io';

  tronWebInstance = new TronWeb({
    fullHost,
    headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY || '' },
  });

  return tronWebInstance;
};

const resetInstance = () => { tronWebInstance = null; };

/**
 * 生成 TRC20 地址
 * @returns {{ address, privateKey }}
 */
const generateAddress = async () => {
  const tronWeb = getTronWeb();
  const account = await tronWeb.createAccount();
  return {
    address: account.address.base58,
    privateKey: account.privateKey,
  };
};

const USDT_CONTRACT = process.env.TRC20_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

/**
 * 查询 TRC20 USDT 余额（RPC 直查合约 balanceOf）
 */
const getUSDTBalance = async (address) => {
  try {
    const tronWeb = getTronWeb();
    tronWeb.setAddress(USDT_CONTRACT);
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const raw = await contract.balanceOf(address).call();
    const val = Number(raw.toString());
    return (val / 1e6).toString();
  } catch (err) {
    logger.error('[TRC20] 余额查询失败', { address, error: err.message });
    throw err;
  }
};

/**
 * 查询 TRX 余额（用于手续费检查）
 */
const getTRXBalance = async (address) => {
  try {
    const tronWeb = getTronWeb();
    const balance = await tronWeb.trx.getBalance(address);
    return (Number(balance || 0) / 1e6).toString();
  } catch (err) {
    logger.error('[TRC20] TRX余额查询失败', { address, error: err.message });
    return '0';
  }
};

/**
 * TRC20 USDT 转账
 */
const transferUSDT = async (privateKey, toAddress, amount) => {
  const tronWeb = getTronWeb();
  const contract = process.env.TRC20_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const amountSun = Math.floor(parseFloat(amount) * 1e6);

  try {
    tronWeb.setPrivateKey(privateKey);
    const instance = await tronWeb.contract().at(contract);
    const txid = await instance.transfer(toAddress, amountSun).send({
      feeLimit: 100000000,
      shouldPollResponse: false,
    });
    logger.info('[TRC20] 转账成功', { to: toAddress, amount, txid });
    return txid;
  } catch (err) {
    logger.error('[TRC20] 转账失败', { to: toAddress, amount, error: err.message });
    throw err;
  }
};

/**
 * 获取当前区块高度
 */
const getCurrentBlock = async () => {
  const tronWeb = getTronWeb();
  const block = await tronWeb.trx.getCurrentBlock();
  return block.block_header.raw_data.number;
};

/**
 * 获取区块内 TRC20 USDT 转账记录
 */
const getBlockTransfers = async (blockNumber) => {
  const tronWeb = getTronWeb();
  const contract = process.env.TRC20_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

  try {
    const block = await tronWeb.trx.getBlock(blockNumber);
    if (!block || !block.transactions) return [];

    const transfers = [];
    for (const tx of block.transactions) {
      // ret 可能不存在（getBlock 部分节点不返回），仅在有 ret 且非成功时跳过
      if (tx.ret && tx.ret[0] && tx.ret[0].contractRet !== 'SUCCESS') continue;
      const contractData = tx.raw_data?.contract?.[0];
      if (!contractData || contractData.type !== 'TriggerSmartContract') continue;

      const { contract_address, data } = contractData.parameter.value;
      const contractAddr = tronWeb.address.fromHex(contract_address);
      if (contractAddr !== contract) continue;

      if (data && data.startsWith('a9059cbb')) {
        const toHex = '41' + data.substring(32, 72);
        const toAddress = tronWeb.address.fromHex(toHex);
        const amountHex = data.substring(72, 136);
        const amount = (parseInt(amountHex, 16) / 1e6).toString();

        transfers.push({
          txid: tx.txID,
          toAddress,
          amount,
          blockNumber,
        });
      }
    }
    return transfers;
  } catch (err) {
    logger.error('[TRC20] 区块扫描失败', { blockNumber, error: err.message });
    return [];
  }
};

/**
 * 获取交易确认数
 */
const getTransactionConfirmations = async (txid) => {
  const tronWeb = getTronWeb();
  try {
    const tx = await tronWeb.trx.getTransactionInfo(txid);
    if (!tx || !tx.blockNumber) return 0;
    const currentBlock = await getCurrentBlock();
    return currentBlock - tx.blockNumber;
  } catch {
    return 0;
  }
};

module.exports = {
  generateAddress,
  getUSDTBalance,
  getTRXBalance,
  transferUSDT,
  getCurrentBlock,
  getBlockTransfers,
  getTransactionConfirmations,
  resetInstance,
};
