# USDT 支付中间件（TRC20 + BSC 双链）

轻量化区块链 USDT 资产中间件，基于 Node.js + SQLite + Redis 构建，提供标准化 OpenAPI 供第三方快速对接充币、提币、批量转账、批量归集全能力。

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端框架 | Express |
| 数据库 | SQLite (better-sqlite3) |
| 缓存/队列 | Redis + Bull |
| TRC20 交互 | TronWeb |
| BSC 交互 | Web3.js |
| 前端框架 | Vue 3 + Element Plus |
| 进程守护 | PM2 |

## 项目结构

```
├── src/
│   ├── app.js                # API 服务入口
│   ├── task-worker.js         # 任务消费服务
│   ├── scheduler.js           # 定时任务服务
│   ├── database/
│   │   ├── db.js              # SQLite 连接
│   │   └── init.js            # 数据库初始化
│   ├── chain/
│   │   ├── trc20.js           # TRC20 链交互
│   │   ├── bsc.js             # BSC 链交互
│   │   └── index.js           # 统一入口
│   ├── services/              # 业务服务层
│   ├── routes/
│   │   ├── openApi.js         # 开放 API（商户对接）
│   │   └── adminApi.js        # 管理后台 API
│   ├── middlewares/           # 中间件（鉴权、限流）
│   ├── tasks/                 # 异步任务处理器
│   └── utils/                 # 工具模块
├── frontend/                  # Vue 3 管理后台
├── ecosystem.config.js        # PM2 配置
├── .env.example               # 环境变量模板
└── package.json
```

## 快速部署

> **云服务器 + 宝塔部署**：详见 [docs/宝塔部署指南.md](docs/宝塔部署指南.md)，含 Nginx、Redis、PM2、SSL 配置。

### 1. 环境要求

- Node.js >= 18 LTS
- Redis >= 6
- PM2（全局安装：`npm i -g pm2`）

### 2. 安装依赖

```bash
# 后端依赖
npm install

# 前端依赖
cd frontend && npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填写：
# - AES 加密密钥（必须32字符）
# - Redis 连接信息
# - TronGrid API Key
# - JWT 密钥
# - 管理员账号密码
```

### 4. 初始化数据库

```bash
npm run init-db
```

### 5. 构建前端

```bash
npm run build:front
```

### 6. 启动服务

```bash
# 开发模式
npm run dev          # API 服务
npm run task         # 任务消费
npm run scheduler    # 定时任务

# 生产模式（PM2）
pm2 start ecosystem.config.js
pm2 save
```

### 7. 访问

- 管理后台：http://localhost:3000
- 默认账号：admin / admin123456
- 开放 API：http://localhost:3000/api/v1

## 三个进程说明

| 进程 | 职责 |
|------|------|
| usdt-api | HTTP 服务，处理开放 API 和管理后台 API |
| usdt-task | 消费 Bull 队列，执行提币签名上链、批量转账等 |
| usdt-scheduler | 定时任务：充币扫描、自动归集、回调重试、节点健康检查 |

## 开放 API 接口列表

所有接口需携带 `x-api-key`、`x-timestamp`、`x-sign` 请求头。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/address/generate | 生成单个地址 |
| POST | /api/v1/address/batch-generate | 批量生成地址 |
| GET | /api/v1/address/balance | 查询地址余额 |
| GET | /api/v1/address/list | 地址列表 |
| GET | /api/v1/deposit/list | 充币订单列表 |
| GET | /api/v1/deposit/detail | 充币订单详情 |
| POST | /api/v1/withdraw/apply | 提币申请 |
| GET | /api/v1/withdraw/detail | 提币订单详情 |
| GET | /api/v1/withdraw/list | 提币订单列表 |
| POST | /api/v1/batch/transfer | 批量转账 |
| POST | /api/v1/batch/collection | 批量归集 |
| GET | /api/v1/batch/detail | 批量任务详情 |

## 签名规则

1. 将所有请求参数（不含 sign）按 key 字典排序
2. 拼接为 `key1=value1&key2=value2&...&secret=YOUR_API_SECRET`
3. 对拼接字符串进行 MD5 运算，转大写
4. 将结果作为 `sign` 参数传入

## Nginx 反向代理参考

```nginx
server {
    listen 443 ssl;
    server_name pay.yourdomain.com;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
