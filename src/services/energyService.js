/**
 * feee.io 能量租赁服务
 * 在 TRC20 转账前为目标地址租赁能量，实现子地址零 TRX 转账
 */
const axios = require('axios');
const logger = require('../utils/logger');
const configService = require('./configService');

const FEEE_BASE = 'https://feee.io/open';

const getConfig = () => {
  const apiKey = configService.get('feee_api_key') || '';
  const userAgent = configService.get('feee_user_agent') || 'feee';
  const enabled = configService.get('feee_energy_enabled') || '1';
  return { apiKey, userAgent, enabled: enabled === '1' };
};

const makeRequest = async (method, url, data = null) => {
  const { apiKey, userAgent } = getConfig();
  if (!apiKey) throw new Error('feee.io API Key 未配置');

  logger.chain.info('feee.io API 调用', { method, url: `${FEEE_BASE}${url}` });

  const config = {
    method,
    url: `${FEEE_BASE}${url}`,
    headers: {
      'key': apiKey,
      'User-Agent': userAgent,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  };
  if (data) config.data = data;

  const res = await axios(config);
  if (res.data.code !== 0) {
    logger.chain.error('feee.io 返回错误', { code: res.data.code, msg: res.data.msg });
    throw new Error(`feee.io 错误: ${res.data.msg} (code: ${res.data.code})`);
  }
  return res.data;
};

/**
 * 估算转账所需能量
 */
const estimateEnergy = async (fromAddress, toAddress) => {
  logger.chain.info('估算能量', { from: fromAddress, to: toAddress });
  const res = await makeRequest('GET',
    `/v2/order/estimate_energy?from_address=${fromAddress}&to_address=${toAddress}`);
  logger.chain.info('能量估算结果', { data: res.data });
  return res.data;
};

/**
 * 使用 V3 接口租赁能量（5 分钟，最便宜）
 * @param {string} receiveAddress - 接收能量的地址
 * @param {number} energyAmount - 能量数量，默认 65000
 */
const rentEnergy = async (receiveAddress, energyAmount = 65000) => {
  const { enabled } = getConfig();
  if (!enabled) {
    logger.chain.info('能量租赁已关闭，跳过', { address: receiveAddress });
    return null;
  }

  logger.chain.info('开始租赁能量', { address: receiveAddress, energy: energyAmount });
  const res = await makeRequest('POST', '/v3/order/create', {
    resource_type: 1,
    receive_address: receiveAddress,
    resource_value: energyAmount,
  });

  logger.chain.info('能量租赁成功', {
    orderNo: res.data.order_no,
    address: receiveAddress,
    energy: res.data.resource_value,
    cost: res.data.pay_amount,
    status: res.data.status,
  });

  return res.data;
};

/**
 * 查询 feee.io 平台余额
 */
const queryBalance = async () => {
  const res = await makeRequest('GET', '/v2/api/query');
  logger.chain.info('feee.io 余额查询', {
    balance: res.data.trx_money,
    todayEnergy: res.data.today_energy_value,
  });
  return {
    balance: res.data.trx_money,
    rechargeAddress: res.data.recharge_address,
    todayEnergy: res.data.today_energy_value,
    todayCost: res.data.today_consume_trx_amount,
  };
};

/**
 * 为地址租赁能量并等待到账
 * @param {string} address - 需要能量的地址
 * @param {number} waitMs - 等待到账时间（毫秒）
 */
const rentAndWait = async (address, waitMs = 5000) => {
  const { enabled, apiKey } = getConfig();
  if (!enabled || !apiKey) {
    logger.chain.info('能量租赁未启用或未配置，跳过', { address });
    return false;
  }

  try {
    await rentEnergy(address);
    logger.chain.info('等待能量到账', { address, waitMs });
    await new Promise(resolve => setTimeout(resolve, waitMs));
    logger.chain.info('能量等待完成', { address });
    return true;
  } catch (err) {
    logger.chain.error('能量租赁失败', { address, error: err.message });
    return false;
  }
};

module.exports = { estimateEnergy, rentEnergy, queryBalance, rentAndWait, getConfig };
