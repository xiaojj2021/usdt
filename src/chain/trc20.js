/**
 * TRC20 链交互封装
 * 地址生成、USDT 转账、余额查询（RPC 直查合约）、交易监听
 */
const TronWeb = require('tronweb');
const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../database/db');

let tronWebInstance = null;

const getTronGridApiKey = () => {
  try {
    const row = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('trongrid_api_key');
    return row?.config_value || process.env.TRON_API_KEY || '';
  } catch {
    return process.env.TRON_API_KEY || '';
  }
};

const getTronWeb = () => {
  if (tronWebInstance) return tronWebInstance;

  const configRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('trc20_rpc_url');
  const fullHost = configRow?.config_value || process.env.TRON_FULL_HOST || 'https://api.trongrid.io';

  tronWebInstance = new TronWeb({
    fullHost,
    headers: { 'TRON-PRO-API-KEY': getTronGridApiKey() },
  });

  return tronWebInstance;
};

const createFreshTronWeb = () => {
  const configRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('trc20_rpc_url');
  const fullHost = configRow?.config_value || process.env.TRON_FULL_HOST || 'https://api.trongrid.io';
  return new TronWeb({
    fullHost,
    headers: { 'TRON-PRO-API-KEY': getTronGridApiKey() },
  });
};

const resetInstance = () => { tronWebInstance = null; };

const ensureFreshInstance = () => {
  tronWebInstance = null;
  return getTronWeb();
};

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

const getRpcConfig = () => {
  const configRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('trc20_rpc_url');
  const host = configRow?.config_value || process.env.TRON_FULL_HOST || 'https://api.trongrid.io';
  const apiKey = getTronGridApiKey();
  return { host, apiKey };
};

/**
 * 获取当前区块高度（纯 HTTP，绕过 TronWeb 的 readable-stream 兼容问题）
 */
const getCurrentBlock = async () => {
  const { host, apiKey } = getRpcConfig();
  const { data } = await axios.post(`${host}/wallet/getnowblock`, {}, {
    headers: { 'TRON-PRO-API-KEY': apiKey },
    timeout: 10000,
  });
  return data.block_header.raw_data.number;
};

/**
 * 获取区块内 TRC20 USDT 转账记录（纯 HTTP + 限流重试）
 */
const getBlockTransfers = async (blockNumber, retries = 2) => {
  const contract = process.env.TRC20_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const { host, apiKey } = getRpcConfig();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data: block } = await axios.post(`${host}/wallet/getblockbynum`, { num: blockNumber }, {
        headers: { 'TRON-PRO-API-KEY': apiKey },
        timeout: 10000,
      });
      if (!block || !block.transactions) return [];

      const transfers = [];
      for (const tx of block.transactions) {
        if (tx.ret && tx.ret[0] && tx.ret[0].contractRet !== 'SUCCESS') continue;
        const contractData = tx.raw_data?.contract?.[0];
        if (!contractData || contractData.type !== 'TriggerSmartContract') continue;

        const { contract_address, data } = contractData.parameter.value;
        const contractAddr = TronWeb.address.fromHex(contract_address);
        if (contractAddr !== contract) continue;

        if (data && data.startsWith('a9059cbb')) {
          const toHex = '41' + data.substring(32, 72);
          const toAddress = TronWeb.address.fromHex(toHex);
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
      const isRetriable = err.message?.includes('429') || err.response?.status === 429
        || err.message?.includes('write after end') || err.message?.includes('ECONNRESET');
      if (isRetriable && attempt < retries) {
        const wait = (attempt + 1) * 2000;
        logger.chain.warn('TRC20 扫描重试', { blockNumber, attempt: attempt + 1, waitMs: wait, error: err.message });
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (attempt === retries) {
        logger.chain.error('TRC20 区块扫描失败', { blockNumber, error: err.message });
      }
      return [];
    }
  }
  return [];
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
  ensureFreshInstance,
};
