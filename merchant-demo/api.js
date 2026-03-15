const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.PAYMENT_API_URL || 'http://localhost:3000/api/v1';
const API_KEY = process.env.API_KEY || '';
const API_SECRET = process.env.API_SECRET || '';

function generateSign(params, secret) {
  const sorted = Object.keys(params).sort();
  const str = sorted.map(k => `${k}=${params[k]}`).join('&') + `&secret=${secret}`;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function verifySign(data) {
  const params = { ...data };
  const receivedSign = params.sign;
  delete params.sign;
  params.sign = receivedSign;
  const expected = generateSign(params, API_SECRET);
  return expected === receivedSign;
}

async function callAPI(method, endpoint, body = {}) {
  const timestamp = Date.now().toString();
  const allParams = { ...body, api_key: API_KEY, timestamp };
  const sign = generateSign(allParams, API_SECRET);
  allParams.sign = sign;

  const config = {
    headers: {
      'X-Api-Key': API_KEY,
      'X-Timestamp': timestamp,
      'X-Sign': sign,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  };

  try {
    let response;
    if (method === 'GET') {
      config.params = { ...body, timestamp, api_key: API_KEY, sign };
      response = await axios.get(`${BASE_URL}${endpoint}`, config);
    } else {
      // POST：鉴权参数与 body 一并发送，确保服务端验签使用完整参数
      const postBody = { ...body, api_key: API_KEY, timestamp, sign };
      response = await axios.post(`${BASE_URL}${endpoint}`, postBody, config);
    }
    return response.data;
  } catch (err) {
    return { code: -1, msg: err.response?.data?.msg || err.message };
  }
}

const generateAddress = (chainType, userId) => callAPI('POST', '/address/generate', { chain_type: chainType, user_id: userId });
const withdrawApply = (chainType, toAddress, amount, merchantOrderNo) => callAPI('POST', '/withdraw/apply', { chain_type: chainType, to_address: toAddress, amount, merchant_order_no: merchantOrderNo });

module.exports = { generateSign, verifySign, callAPI, generateAddress, withdrawApply };
