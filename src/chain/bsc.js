/**
 * BSC (BEP20) 链交互封装
 * 地址生成、USDT 转账、余额查询（RPC 直查合约）、交易监听
 * 纯 axios JSON-RPC 调用 + 多节点自动切换
 */
const { Web3 } = require('web3');
const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../database/db');

const ERC20_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'from', type: 'address' }, { indexed: true, name: 'to', type: 'address' }, { indexed: false, name: 'value', type: 'uint256' }], name: 'Transfer', type: 'event' },
];

const BSC_RPC_NODES = [
  process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed2.defibit.io',
  'https://bsc-dataseed1.ninicoin.io',
  'https://bsc-dataseed2.ninicoin.io',
  'https://1rpc.io/bnb',
  'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3',
  'https://bsc.drpc.org',
  'https://bsc-mainnet.public.blastapi.io',
  'https://api.zan.top/bsc-mainnet',
  'https://bsc-rpc.publicnode.com',
  'https://bsc.meowrpc.com',
  'https://binance.llamarpc.com',
];

const RPC_TIMEOUT = 5000;
let currentNodeIdx = 0;
let rpcId = 1;
let useDbConfig = true;

const getCurrentRpc = () => {
  if (useDbConfig) {
    const configRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('bsc_rpc_url');
    if (configRow?.config_value) return configRow.config_value;
  }
  return BSC_RPC_NODES[currentNodeIdx];
};

const switchNode = () => {
  useDbConfig = false;
  currentNodeIdx = (currentNodeIdx + 1) % BSC_RPC_NODES.length;
  web3Instance = null;
  const newNode = BSC_RPC_NODES[currentNodeIdx];
  logger.chain.warn('BSC 切换备用节点', { newNode, idx: currentNodeIdx });
  return newNode;
};

const resetInstance = () => { currentNodeIdx = 0; web3Instance = null; useDbConfig = true; };

const rpcCall = async (method, params = []) => {
  const url = getCurrentRpc();
  const { data } = await axios.post(url, {
    jsonrpc: '2.0', id: rpcId++, method, params,
  }, { timeout: RPC_TIMEOUT });
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
};

const isConnErr = (err) => {
  const msg = (err.message || '') + (err.code || '');
  return msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')
    || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
    || msg.includes('ECONNABORTED') || msg.includes('socket hang up')
    || msg.includes('network') || msg.includes('write after end')
    || msg.includes('failed, reason') || msg.includes('Invalid response')
    || msg.includes('CONNECTION ERROR') || msg.includes('timeout')
    || msg.includes('CERT_') || msg.includes('certificate');
};

const withRetry = async (fn, label, maxRetries = Math.min(BSC_RPC_NODES.length, 10)) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (isConnErr(err) && i < maxRetries - 1) {
        logger.chain.warn(`BSC ${label} 连接失败，切换节点重试`, { attempt: i + 1, error: err.message });
        switchNode();
        continue;
      }
      throw err;
    }
  }
};

let web3Instance = null;
const getWeb3 = () => {
  if (web3Instance) return web3Instance;
  const rpcUrl = getCurrentRpc();
  web3Instance = new Web3(new Web3.providers.HttpProvider(rpcUrl, { timeout: RPC_TIMEOUT }));
  return web3Instance;
};

const BSC_USDT = process.env.BSC_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';

/**
 * 生成 BSC 地址（离线操作，不需要 RPC）
 */
const generateAddress = async () => {
  const web3 = getWeb3();
  const account = web3.eth.accounts.create();
  return { address: account.address, privateKey: account.privateKey };
};

/**
 * 查询 BSC USDT 余额（axios JSON-RPC）
 */
const getUSDTBalance = async (address) => {
  return withRetry(async () => {
    const web3 = getWeb3();
    const contract = new web3.eth.Contract(ERC20_ABI, BSC_USDT);
    const callData = contract.methods.balanceOf(address).encodeABI();
    const result = await rpcCall('eth_call', [{ to: BSC_USDT, data: callData }, 'latest']);
    return (Number(BigInt(result)) / 1e18).toString();
  }, '余额查询');
};

/**
 * BSC USDT 转账（Web3 签名 + axios 广播，不重试避免重复发送）
 */
const transferUSDT = async (privateKey, fromAddress, toAddress, amount) => {
  const web3 = getWeb3();
  const contract = new web3.eth.Contract(ERC20_ABI, BSC_USDT);
  const amountWei = web3.utils.toWei(amount.toString(), 'ether');

  try {
    const data = contract.methods.transfer(toAddress, amountWei).encodeABI();
    const gasPriceHex = await rpcCall('eth_gasPrice');
    const nonceHex = await rpcCall('eth_getTransactionCount', [fromAddress, 'pending']);

    const tx = {
      from: fromAddress,
      to: BSC_USDT,
      data,
      gas: 100000,
      gasPrice: gasPriceHex,
      nonce: nonceHex,
      chainId: parseInt(process.env.BSC_CHAIN_ID || '56'),
    };

    const signed = await web3.eth.accounts.signTransaction(tx, privateKey);
    const txHash = await rpcCall('eth_sendRawTransaction', [signed.rawTransaction]);
    logger.chain.info('BSC 转账成功', { from: fromAddress, to: toAddress, amount, txHash });
    return txHash;
  } catch (err) {
    logger.chain.error('BSC 转账失败', { from: fromAddress, to: toAddress, amount, error: err.message });
    throw err;
  }
};

/**
 * 获取当前区块高度（axios JSON-RPC）
 */
const getCurrentBlock = async () => {
  return withRetry(async () => {
    const result = await rpcCall('eth_blockNumber');
    return Number(BigInt(result));
  }, '获取区块高度');
};

/**
 * 扫描区块内 USDT Transfer 事件（axios JSON-RPC）
 */
const getBlockTransfers = async (fromBlock, toBlock) => {
  return withRetry(async () => {
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const result = await rpcCall('eth_getLogs', [{
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + toBlock.toString(16),
      address: BSC_USDT,
      topics: [transferTopic],
    }]);

    return (result || []).map(log => ({
      txid: log.transactionHash,
      fromAddress: '0x' + log.topics[1].slice(26),
      toAddress: '0x' + log.topics[2].slice(26),
      amount: (Number(BigInt(log.data)) / 1e18).toString(),
      blockNumber: Number(BigInt(log.blockNumber)),
    }));
  }, '区块扫描');
};

/**
 * 获取交易确认数
 */
const getTransactionConfirmations = async (txHash) => {
  try {
    const tx = await rpcCall('eth_getTransactionByHash', [txHash]);
    if (!tx || !tx.blockNumber) return 0;
    const currentBlock = await getCurrentBlock();
    return currentBlock - Number(BigInt(tx.blockNumber));
  } catch {
    return 0;
  }
};

/**
 * 获取 BNB 余额（用于Gas费检测）
 */
const getBNBBalance = async (address) => {
  return withRetry(async () => {
    const result = await rpcCall('eth_getBalance', [address, 'latest']);
    const web3 = getWeb3();
    return web3.utils.fromWei(BigInt(result).toString(), 'ether');
  }, 'BNB余额查询');
};

module.exports = {
  generateAddress,
  getUSDTBalance,
  transferUSDT,
  getCurrentBlock,
  getBlockTransfers,
  getTransactionConfirmations,
  getBNBBalance,
  resetInstance,
};
