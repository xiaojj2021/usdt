/**
 * 开放 API 路由（第三方商户对接）
 */
const express = require('express');
const router = express.Router();
const { merchantAuth } = require('../middlewares/auth');
const { success, error } = require('../utils/response');
const addressService = require('../services/addressService');
const depositService = require('../services/depositService');
const withdrawService = require('../services/withdrawService');
const transferService = require('../services/transferService');
const logService = require('../services/logService');

router.use(merchantAuth);

// ========== 地址管理 ==========

/** 生成单个地址 */
router.post('/address/generate', async (req, res) => {
  try {
    const { chain_type, user_id } = req.body;
    if (!chain_type) return res.json(error('缺少 chain_type'));
    const result = await addressService.generate(chain_type, req.merchant.id, user_id);
    res.json(success(result, '地址生成成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 批量生成地址 */
router.post('/address/batch-generate', async (req, res) => {
  try {
    const { chain_type, count, user_ids } = req.body;
    if (!chain_type || !count) return res.json(error('缺少参数'));
    if (count > 100) return res.json(error('单次最多生成100个'));
    const result = await addressService.batchGenerate(chain_type, req.merchant.id, count, user_ids || []);
    res.json(success(result, `成功生成 ${result.length} 个地址`));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 查询地址余额 */
router.get('/address/balance', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.json(error('缺少 address'));
    const result = await addressService.queryBalance(address);
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 地址列表 */
router.get('/address/list', async (req, res) => {
  try {
    const { page = 1, page_size = 20, chain_type } = req.query;
    const result = await addressService.list(page, page_size, { chain_type, merchant_id: req.merchant.id });
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 充币查询 ==========

/** 充币订单列表 */
router.get('/deposit/list', (req, res) => {
  try {
    const { page = 1, page_size = 20, ...filters } = req.query;
    filters.merchant_id = req.merchant.id;
    const result = depositService.list(page, page_size, filters);
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 充币订单详情 */
router.get('/deposit/detail', (req, res) => {
  try {
    const { order_no } = req.query;
    if (!order_no) return res.json(error('缺少 order_no'));
    const order = depositService.getByOrderNo(order_no);
    if (!order || order.merchant_id !== req.merchant.id) return res.json(error('订单不存在'));
    res.json(success(order));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 提币申请 ==========

/** 提币申请 */
router.post('/withdraw/apply', (req, res) => {
  try {
    const { chain_type, to_address, amount, merchant_order_no } = req.body;
    if (!chain_type || !to_address || !amount) return res.json(error('缺少必要参数'));
    if (parseFloat(amount) <= 0) return res.json(error('金额必须大于0'));

    const riskErrors = withdrawService.riskCheck({
      to_address, amount, merchant_order_no, merchant_id: req.merchant.id,
    });
    if (riskErrors.length > 0) return res.json(error(riskErrors.join('；')));

    const result = withdrawService.create({
      chain_type, to_address, amount, merchant_order_no, merchant_id: req.merchant.id,
    });
    logService.write('api', '提币', '申请', JSON.stringify({ to_address, amount }), req.ip, req.merchant.api_key);
    res.json(success(result, '提币申请已提交'));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 提币订单查询 */
router.get('/withdraw/detail', (req, res) => {
  try {
    const { order_no } = req.query;
    if (!order_no) return res.json(error('缺少 order_no'));
    const order = withdrawService.getByOrderNo(order_no);
    if (!order || order.merchant_id !== req.merchant.id) return res.json(error('订单不存在'));
    res.json(success(order));
  } catch (err) {
    res.json(error(err.message));
  }
});

/** 提币订单列表 */
router.get('/withdraw/list', (req, res) => {
  try {
    const { page = 1, page_size = 20, ...filters } = req.query;
    filters.merchant_id = req.merchant.id;
    const result = withdrawService.list(page, page_size, filters);
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message));
  }
});

// ========== 转账 ==========

/** 单笔转账 */
router.post('/transfer/execute', async (req, res) => {
  try {
    const { from_address, to_address, amount } = req.body;
    if (!from_address || !to_address || !amount) return res.json(error('缺少参数：from_address、to_address、amount'));

    const fromRow = addressService.getByAddress(from_address);
    if (!fromRow || fromRow.merchant_id !== req.merchant.id) return res.json(error('转出地址不存在或不属于当前商户'));

    const result = await transferService.execute(from_address, to_address, amount);
    logService.write('api', '转账', '执行', JSON.stringify({ from_address, to_address, amount, txid: result.txid }), req.ip, req.merchant.api_key);
    res.json(success(result, '转账成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

module.exports = router;
