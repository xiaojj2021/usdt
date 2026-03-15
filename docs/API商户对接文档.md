# USDT 支付中间件 · 商户对接 API 文档

## 一、概述

本文档面向第三方商户（支付、电商、游戏、代发等）接入 USDT 支付中间件，实现 TRC20、BSC 双链 USDT 充币、提币、转账等能力。

**基础信息**

| 项目 | 说明 |
|------|------|
| 协议 | HTTPS + JSON |
| 基础路径 | `https://您的域名/api/v1` |
| 字符编码 | UTF-8 |
| 链类型 | `trc20` / `bsc` |

---

## 二、鉴权说明

所有接口均需完成商户鉴权，方式如下。

### 2.1 必需参数

| 参数名 | 传递方式 | 说明 |
|--------|----------|------|
| `api_key` | Header: `X-Api-Key` 或 Query/Body | 商户 API Key，管理后台分配 |
| `timestamp` | Header: `X-Timestamp` 或 Query/Body | 当前时间戳（毫秒），用于防重放，有效期 5 分钟 |
| `sign` | Header: `X-Sign` 或 Query/Body | 请求签名，大写 MD5 |

### 2.2 签名规则

1. 将所有请求参数（含 `api_key`、`timestamp`、`sign`）按 **key 字典升序** 排列
2. 拼接为 `key1=value1&key2=value2&...`（`sign` 参与排序，参与签名的原值）
3. 在末尾追加 `&secret=商户API_SECRET`
4. 对整个字符串做 **MD5**，转 **大写** 得到 `sign`

**示例（生成地址，POST JSON）：**

```
原始参数（按 key 排序）:
  api_key=ak_xxx
  chain_type=trc20
  sign=待计算
  timestamp=1700000000000
  user_id=U001

拼接字符串:
  api_key=ak_xxx&chain_type=trc20&sign=xxx&timestamp=1700000000000&user_id=U001&secret=sk_xxx

sign = MD5(上述字符串).toUpperCase()
```

**示例代码（Node.js）：**

```javascript
const crypto = require('crypto');

function generateSign(params, secret) {
  const sorted = Object.keys(params).sort();
  const str = sorted.map(k => `${k}=${params[k]}`).join('&') + `&secret=${secret}`;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

// POST /address/generate
const body = { chain_type: 'trc20', user_id: 'U001' };
const ts = Date.now().toString();
const all = { ...body, api_key: 'ak_xxx', timestamp: ts };
all.sign = generateSign(all, 'sk_xxx');

// 请求时: headers['X-Api-Key'] = 'ak_xxx', headers['X-Timestamp'] = ts, headers['X-Sign'] = all.sign
// body 传 body
```

### 2.3 IP 白名单

若商户在后台配置了 IP 白名单，仅白名单内的 IP 可调用接口。未配置或配置 `*` 则不做限制。

---

## 三、响应格式

### 3.1 成功响应

```json
{
  "code": 0,
  "msg": "操作成功",
  "data": { ... },
  "timestamp": 1700000000000
}
```

### 3.2 失败响应

```json
{
  "code": -1,
  "msg": "错误描述",
  "data": null,
  "timestamp": 1700000000000
}
```

常见 HTTP 状态码：
- `200`：请求成功（业务可能失败，以 `code` 为准）
- `401`：鉴权失败（缺少参数、签名错误、时间戳过期等）
- `403`：商户被禁用或 IP 不在白名单
- `500`：服务器内部错误

### 3.3 分页响应

```json
{
  "code": 0,
  "msg": "查询成功",
  "data": {
    "list": [ ... ],
    "pagination": {
      "total": 100,
      "page": 1,
      "pageSize": 20,
      "totalPages": 5
    }
  },
  "timestamp": 1700000000000
}
```

---

## 四、接口列表

### 4.1 地址管理

#### 4.1.1 生成单个地址

**接口**：`POST /api/v1/address/generate`

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| chain_type | string | 是 | 链类型：`trc20` / `bsc` |
| user_id | string | 否 | 商户侧用户 ID，用于绑定 |

**响应 data**

```json
{
  "id": 1,
  "chain_type": "trc20",
  "address": "Txxx...",
  "merchant_id": 1,
  "user_id": "U001"
}
```

---

#### 4.1.2 批量生成地址

**接口**：`POST /api/v1/address/batch-generate`

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| chain_type | string | 是 | 链类型：`trc20` / `bsc` |
| count | number | 是 | 生成数量，最大 100 |
| user_ids | string[] | 否 | 商户侧用户 ID 数组，按顺序绑定 |

**响应 data**：地址对象数组

---

#### 4.1.3 查询地址余额

**接口**：`GET /api/v1/address/balance`

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| address | string | 是 | 钱包地址 |

**响应 data**

```json
{
  "address": "Txxx...",
  "chain_type": "trc20",
  "balance": "100.500000"
}
```

---

#### 4.1.4 地址列表

**接口**：`GET /api/v1/address/list`

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| page_size | number | 否 | 每页条数，默认 20 |
| chain_type | string | 否 | 链类型筛选 |

**响应 data**：分页结构，list 中每项包含 `id`、`address`、`chain_type`、`merchant_id`、`user_id`、`balance`、`status`、`create_time` 等

---

### 4.2 充币订单

#### 4.2.1 充币订单列表

**接口**：`GET /api/v1/deposit/list`

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| page_size | number | 否 | 每页条数 |
| order_no | string | 否 | 订单号 |
| address | string | 否 | 收款地址 |
| chain_type | string | 否 | 链类型 |
| status | number | 否 | 0待确认 / 1成功 / 2失败 |

**响应 data**：分页结构

---

#### 4.2.2 充币订单详情

**接口**：`GET /api/v1/deposit/detail`

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| order_no | string | 是 | 平台订单号 |

**响应 data**

```json
{
  "order_no": "DEP202401010001",
  "address": "Txxx...",
  "chain_type": "trc20",
  "amount": "100.500000",
  "txid": "xxx",
  "confirmations": 25,
  "status": 1,
  "merchant_id": 1,
  "create_time": "2024-01-01 12:00:00",
  "update_time": "2024-01-01 12:05:00"
}
```

---

### 4.3 提币申请

#### 4.3.1 提币申请

**接口**：`POST /api/v1/withdraw/apply`

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| chain_type | string | 是 | 链类型：`trc20` / `bsc` |
| to_address | string | 是 | 收款地址 |
| amount | string | 是 | 金额（USDT），需 > 0 |
| merchant_order_no | string | 否 | 商户订单号，用于幂等与对账 |

**响应 data**

```json
{
  "order_no": "WD202401010001",
  "merchant_order_no": "M001",
  "chain_type": "trc20",
  "to_address": "Txxx...",
  "amount": "50.000000",
  "audit_status": 0,
  "status": 0,
  "create_time": "2024-01-01 12:00:00"
}
```

说明：
- `audit_status`：0待审核 / 1通过 / 2驳回
- `status`：0处理中 / 1成功 / 2失败
- 人工审核模式下需后台审核通过后才会执行上链
- 按阈值模式：低于阈值的自动审核，等于或高于阈值的人工审核（阈值可在系统配置中设置）

---

#### 4.3.2 提币订单详情

**接口**：`GET /api/v1/withdraw/detail`

**Query 参数**：`order_no`（平台订单号）

---

#### 4.3.3 提币订单列表

**接口**：`GET /api/v1/withdraw/list`

**Query 参数**：`page`、`page_size`、`order_no`、`chain_type`、`status`、`audit_status` 等

---

### 4.4 单笔转账

#### 4.4.1 执行转账

**接口**：`POST /api/v1/transfer/execute`

从商户名下钱包地址向任意地址转出 USDT。

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from_address | string | 是 | 转出地址（须为平台生成且属于当前商户） |
| to_address | string | 是 | 收款地址 |
| amount | string | 是 | 金额（USDT），需 > 0 |

**响应 data**

```json
{
  "txid": "0xabc123...",
  "chain_type": "trc20"
}
```

#### 4.4.2 批量转账

**接口**：`POST /api/v1/transfer/batch-execute`

从同一地址向多个地址批量转出 USDT（如分红、代发）。

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from_address | string | 是 | 转出地址（须为平台生成且属于当前商户） |
| items | array | 是 | 收款列表 |
| items[].to_address | string | 是 | 收款地址 |
| items[].amount | string | 是 | 金额（USDT） |

**响应 data**

```json
{
  "success_count": 3,
  "fail_count": 0,
  "results": [
    { "index": 0, "success": true, "txid": "0x..." },
    { "index": 1, "success": true, "txid": "0x..." }
  ]
}
```

---

## 五、异步回调通知

商户在后台配置 `callback_url` 后，平台会在充币成功、提币完成时主动 POST 回调。

### 5.1 回调格式

- 内容类型：`application/json`
- 请求体：JSON，含业务数据及 `sign` 字段

### 5.2 签名校验

商户需对回调 body 校验 `sign`：

1. 取出 `sign`，从 body 中删除
2. 将其余字段按 key 字典升序拼接为 `key1=value1&key2=value2&...`
3. 末尾追加 `&secret=商户API_SECRET`
4. 对整体做 MD5 并转大写，与回调中的 `sign` 比对

### 5.3 充币回调

**type**：`deposit`

| 字段 | 说明 |
|------|------|
| type | 固定 `deposit` |
| order_no | 平台订单号 |
| address | 收款地址 |
| chain_type | 链类型 |
| amount | 金额 |
| txid | 链上交易哈希 |
| status | 1成功 / 2失败 |
| timestamp | 时间戳 |
| sign | 签名 |

商户应返回 `code: 0` 或 HTTP 200 表示接收成功；否则平台会按策略重试。

### 5.4 提币回调

**type**：`withdraw`

| 字段 | 说明 |
|------|------|
| type | 固定 `withdraw` |
| order_no | 平台订单号 |
| merchant_order_no | 商户订单号 |
| chain_type | 链类型 |
| to_address | 收款地址 |
| amount | 金额 |
| txid | 链上交易哈希（失败时为空） |
| status | 1成功 / 2失败 |
| timestamp | 时间戳 |
| sign | 签名 |

---

## 六、业务流程说明

### 6.1 充币流程

1. 商户调用 `POST /address/generate` 或 `POST /address/batch-generate` 生成收款地址
2. 将地址展示给用户，用户向该地址转入 USDT（TRC20 或 BEP20）
3. 平台定时扫描链上交易，达到确认数后生成充币订单
4. 平台 POST 回调至商户 `callback_url`，商户根据 `order_no` 入账

### 6.2 提币流程

1. 商户调用 `POST /withdraw/apply` 提交提币申请
2. 自动审核模式下直接排队上链；人工审核模式下需后台通过；按阈值模式下，低于阈值的自动通过、等于或高于需人工审核
3. 上链成功后平台 POST 回调至商户 `callback_url`

### 6.3 转账流程

1. 商户调用 `POST /transfer/execute` 从自有地址转出 USDT
2. 接口同步执行链上转账，成功即返回 `txid`

---

## 七、错误码参考

| code | 说明 |
|------|------|
| 0 | 成功 |
| -1 | 业务失败（见 msg） |
| 401 | 鉴权失败：缺少 api_key/timestamp/sign、签名错误、时间戳过期等 |
| 403 | 商户已禁用或 IP 不在白名单 |

---

## 八、示例：完整请求（Node.js）

```javascript
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://your-domain.com/api/v1';
const API_KEY = 'ak_xxx';
const API_SECRET = 'sk_xxx';

function sign(params, secret) {
  const sorted = Object.keys(params).sort();
  const str = sorted.map(k => `${k}=${params[k]}`).join('&') + `&secret=${secret}`;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

async function generateAddress(chainType, userId) {
  const body = { chain_type: chainType, user_id: userId };
  const timestamp = Date.now().toString();
  const all = { ...body, api_key: API_KEY, timestamp };
  all.sign = sign(all, API_SECRET);

  const { data } = await axios.post(`${BASE_URL}/address/generate`, body, {
    headers: {
      'X-Api-Key': API_KEY,
      'X-Timestamp': timestamp,
      'X-Sign': all.sign,
      'Content-Type': 'application/json',
    },
  });
  return data;
}

// 使用
generateAddress('trc20', 'U001').then(console.log);
```

---

## 九、联系方式

如有对接问题，请联系平台管理员，或查看管理后台的商户配置与日志中心。
