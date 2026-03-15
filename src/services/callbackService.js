/**
 * 异步回调通知服务
 */
const axios = require('axios');
const logger = require('../utils/logger');
const { generateSign } = require('../utils/crypto');
const merchantService = require('./merchantService');

/**
 * 发送回调通知
 * @param {string} callbackUrl 回调地址
 * @param {object} data 回调数据
 * @param {string} apiSecret 商户密钥（用于签名）
 * @returns {boolean} 是否成功
 */
const send = async (callbackUrl, data, apiSecret) => {
  if (!callbackUrl) return false;

  try {
    const sign = generateSign(data, apiSecret);
    const payload = { ...data, sign };

    const response = await axios.post(callbackUrl, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    const success = response.data?.code === 0 || response.data === 'SUCCESS' || response.status === 200;
    logger.info('[回调] 发送结果', { url: callbackUrl, success, status: response.status });
    return success;
  } catch (err) {
    logger.error('[回调] 发送失败', { url: callbackUrl, error: err.message });
    return false;
  }
};

/**
 * 发送充币回调
 */
const sendDepositCallback = async (order) => {
  const merchant = merchantService.getById(order.merchant_id);
  if (!merchant?.callback_url) return false;

  return send(merchant.callback_url, {
    type: 'deposit',
    order_no: order.order_no,
    address: order.address,
    chain_type: order.chain_type,
    amount: order.amount,
    txid: order.txid,
    status: order.status,
    timestamp: Date.now().toString(),
  }, merchant.api_secret);
};

/**
 * 发送提币回调
 */
const sendWithdrawCallback = async (order) => {
  const merchant = merchantService.getById(order.merchant_id);
  if (!merchant?.callback_url) return false;

  return send(merchant.callback_url, {
    type: 'withdraw',
    order_no: order.order_no,
    merchant_order_no: order.merchant_order_no,
    chain_type: order.chain_type,
    to_address: order.to_address,
    amount: order.amount,
    txid: order.txid || '',
    status: order.status,
    timestamp: Date.now().toString(),
  }, merchant.api_secret);
};

module.exports = { send, sendDepositCallback, sendWithdrawCallback };
