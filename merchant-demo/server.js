require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { initDB, prepare, saveToDisk } = require('./db');
const api = require('./api');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: -1, msg: '请输入用户名和密码' });
  try {
    const existing = prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.json({ code: -1, msg: '用户名已存在' });
    const hash = crypto.createHash('md5').update(password).digest('hex');
    const result = prepare('INSERT INTO users (username, password, balance) VALUES (?, ?, 0)').run(username, hash);
    res.json({ code: 0, msg: '注册成功', data: { user_id: result.lastInsertRowid } });
  } catch (err) {
    res.json({ code: -1, msg: err.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ code: -1, msg: '请输入用户名和密码' });
  const hash = crypto.createHash('md5').update(password).digest('hex');
  const user = prepare('SELECT id, username, balance FROM users WHERE username = ? AND password = ?').get(username, hash);
  if (!user) return res.json({ code: -1, msg: '用户名或密码错误' });
  res.json({ code: 0, data: user });
});

app.get('/api/user/:id', (req, res) => {
  const user = prepare('SELECT id, username, balance FROM users WHERE id = ?').get(parseInt(req.params.id));
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  res.json({ code: 0, data: user });
});

app.post('/api/deposit/address', async (req, res) => {
  const { user_id, chain_type } = req.body;
  if (!user_id || !chain_type) return res.json({ code: -1, msg: '参数不完整' });
  try {
    const existing = prepare('SELECT address FROM deposit_addresses WHERE user_id = ? AND chain_type = ?').get(parseInt(user_id), chain_type);
    if (existing) return res.json({ code: 0, data: { address: existing.address, chain_type } });

    const result = await api.generateAddress(chain_type, `user_${user_id}`);
    if (result.code !== 0) return res.json({ code: -1, msg: result.msg || '生成地址失败' });

    prepare('INSERT INTO deposit_addresses (user_id, chain_type, address) VALUES (?, ?, ?)').run(parseInt(user_id), chain_type, result.data.address);
    res.json({ code: 0, data: { address: result.data.address, chain_type } });
  } catch (err) {
    res.json({ code: -1, msg: err.message });
  }
});

app.post('/callback', (req, res) => {
  try {
    const data = req.body;
    console.log('[回调] 收到通知', JSON.stringify(data));

    if (data.type === 'deposit' && (data.status === 1 || data.status === '1')) {
      const addr = prepare('SELECT user_id FROM deposit_addresses WHERE address = ?').get(data.address);
      if (!addr) return res.json({ code: 0 });

      const exists = prepare('SELECT id FROM transactions WHERE platform_order_no = ?').get(data.order_no);
      if (exists) return res.json({ code: 0 });

      const amount = parseFloat(data.amount);
      prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, addr.user_id);
      prepare(`INSERT INTO transactions (user_id, type, chain_type, amount, address, txid, platform_order_no, status) VALUES (?, 'deposit', ?, ?, ?, ?, ?, 'success')`)
        .run(addr.user_id, data.chain_type, amount, data.address, data.txid, data.order_no);
      console.log('[回调] 充值入账', { user_id: addr.user_id, amount, txid: data.txid });
    }

    if (data.type === 'withdraw') {
      const tx = prepare('SELECT id, user_id, amount FROM transactions WHERE platform_order_no = ?').get(data.order_no);
      if (tx) {
        const newStatus = (data.status === 1 || data.status === '1') ? 'success' : 'failed';
        prepare('UPDATE transactions SET status = ?, txid = ? WHERE id = ?').run(newStatus, data.txid || '', tx.id);
        if (data.status === 2 || data.status === '2') {
          prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(tx.amount, tx.user_id);
          console.log('[回调] 提币失败退还', { user_id: tx.user_id, amount: tx.amount });
        }
      }
    }

    res.json({ code: 0 });
  } catch (err) {
    console.error('[回调] 异常', err.message);
    res.json({ code: -1, msg: err.message });
  }
});

app.post('/api/withdraw', async (req, res) => {
  const { user_id, chain_type, to_address, amount } = req.body;
  if (!user_id || !chain_type || !to_address || !amount) return res.json({ code: -1, msg: '参数不完整' });

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 1) return res.json({ code: -1, msg: '最低提币 1 USDT' });

  const user = prepare('SELECT id, balance FROM users WHERE id = ?').get(parseInt(user_id));
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (user.balance < amt) return res.json({ code: -1, msg: `余额不足，当前 ${user.balance} USDT` });

  try {
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amt, parseInt(user_id));
    const merchantOrderNo = `W${user_id}_${Date.now()}`;
    const result = await api.withdrawApply(chain_type, to_address, amt.toString(), merchantOrderNo);

    if (result.code !== 0) {
      prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, parseInt(user_id));
      return res.json({ code: -1, msg: result.msg || '提币申请失败' });
    }

    prepare(`INSERT INTO transactions (user_id, type, chain_type, amount, address, platform_order_no, merchant_order_no, status) VALUES (?, 'withdraw', ?, ?, ?, ?, ?, 'pending')`)
      .run(parseInt(user_id), chain_type, amt, to_address, result.data.order_no, merchantOrderNo);
    res.json({ code: 0, msg: '提币申请已提交', data: { order_no: result.data.order_no } });
  } catch (err) {
    prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, parseInt(user_id));
    res.json({ code: -1, msg: err.message });
  }
});

app.get('/api/transactions/:user_id', (req, res) => {
  const rows = prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(parseInt(req.params.user_id));
  res.json({ code: 0, data: rows });
});

// 启动
(async () => {
  await initDB();
  app.listen(PORT, () => console.log(`[商户Demo] 已启动: http://localhost:${PORT}`));
})();
