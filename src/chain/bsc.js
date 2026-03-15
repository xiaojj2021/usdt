/**
 * BSC (BEP20) 链交互封装
 * 地址生成、USDT 转账、余额查询（RPC 直查合约）、交易监听
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

let web3Instance = null;

const getWeb3 = () => {
  if (web3Instance) return web3Instance;

  const configRow = db.prepare(`SELECT config_value FROM system_config WHERE config_key = ?`).get('bsc_rpc_url');
  const rpcUrl = configRow?.config_value || process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org';

  web3Instance = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  return web3Instance;
};

const resetInstance = () => { web3Instance = null; };

const getContract = () => {
  const web3 = getWeb3();
  const contractAddr = process.env.BSC_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';
  return new web3.eth.Contract(ERC20_ABI, contractAddr);
};

/**
 * 生成 BSC 地址
 */
const generateAddress = async () => {
  const web3 = getWeb3();
  const account = web3.eth.accounts.create();
  return {
    address: account.address,
    privateKey: account.privateKey,
  };
};

const BSC_USDT = process.env.BSC_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';

/**
 * 查询 BSC USDT 余额（RPC 直查合约 balanceOf）
 */
const getUSDTBalance = async (address) => {
  try {
    const contract = getContract();
    const raw = await contract.methods.balanceOf(address).call();
    return (Number(raw.toString()) / 1e18).toString();
  } catch (err) {
    logger.error('[BSC] 余额查询失败', { address, error: err.message });
    throw err;
  }
};

/**
 * BSC USDT 转账
 */
const transferUSDT = async (privateKey, fromAddress, toAddress, amount) => {
  const web3 = getWeb3();
  const contract = getContract();
  const amountWei = web3.utils.toWei(amount.toString(), 'ether');

  try {
    const data = contract.methods.transfer(toAddress, amountWei).encodeABI();
    const gasPrice = await web3.eth.getGasPrice();
    const nonce = await web3.eth.getTransactionCount(fromAddress, 'pending');

    const tx = {
      from: fromAddress,
      to: process.env.BSC_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955',
      data,
      gas: 100000,
      gasPrice,
      nonce,
      chainId: parseInt(process.env.BSC_CHAIN_ID || '56'),
    };

    const signed = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
    const txHash = receipt.transactionHash;
    logger.info('[BSC] 转账成功', { from: fromAddress, to: toAddress, amount, txHash });
    return txHash;
  } catch (err) {
    logger.error('[BSC] 转账失败', { from: fromAddress, to: toAddress, amount, error: err.message });
    throw err;
  }
};

/**
 * 获取当前区块高度
 */
const getCurrentBlock = async () => {
  const web3 = getWeb3();
  return Number(await web3.eth.getBlockNumber());
};

/**
 * 扫描区块内 USDT Transfer 事件
 */
const getBlockTransfers = async (fromBlock, toBlock) => {
  const contract = getContract();
  try {
    const events = await contract.getPastEvents('Transfer', { fromBlock, toBlock });
    return events.map(e => ({
      txid: e.transactionHash,
      fromAddress: e.returnValues.from,
      toAddress: e.returnValues.to,
      amount: (Number(e.returnValues.value) / 1e18).toString(),
      blockNumber: Number(e.blockNumber),
    }));
  } catch (err) {
    logger.error('[BSC] 区块扫描失败', { fromBlock, toBlock, error: err.message });
    return [];
  }
};

/**
 * 获取交易确认数
 */
const getTransactionConfirmations = async (txHash) => {
  const web3 = getWeb3();
  try {
    const tx = await web3.eth.getTransaction(txHash);
    if (!tx || !tx.blockNumber) return 0;
    const currentBlock = await getCurrentBlock();
    return currentBlock - Number(tx.blockNumber);
  } catch {
    return 0;
  }
};

/**
 * 获取 BNB 余额（用于Gas费检测）
 */
const getBNBBalance = async (address) => {
  const web3 = getWeb3();
  const balance = await web3.eth.getBalance(address);
  return web3.utils.fromWei(balance, 'ether');
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
