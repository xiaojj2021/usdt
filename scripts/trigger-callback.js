/**
 * 手动触发充币回调
 * 用法: node scripts/trigger-callback.js [order_no或txid]
 * 示例: node scripts/trigger-callback.js DEP177348883687756HQQD
 *       node scripts/trigger-callback.js 87473158c0c4222db14da323c2093f53b2eabc9578e4cdec6bf7c9a78607c084
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function main() {
  const baseDir = path.join(__dirname, '..');
  const dbPath = path.resolve(baseDir, process.env.SQLITE_DB_PATH || 'data/payment.db');
  if (!fs.existsSync(dbPath)) {
    console.log('[失败] 数据库文件不存在:', dbPath);
    process.exit(1);
  }
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const arg = process.argv[2] || '87473158c0c4222db14da323c2093f53b2eabc9578e4cdec6bf7c9a78607c084';
  const isTxid = arg.length === 64 && /^[a-f0-9]+$/i.test(arg);
  const where = isTxid ? `d.txid = '${arg.replace(/'/g, "''")}'` : `d.order_no = '${arg.replace(/'/g, "''")}'`;
  const orderRow = db.exec(
    `SELECT d.order_no, d.address, d.chain_type, d.amount, d.txid, d.status, d.merchant_id, m.callback_url, m.api_secret FROM deposit_order d LEFT JOIN merchant m ON d.merchant_id = m.id WHERE ${where}`
  );
  if (!orderRow.length || !orderRow[0].values.length) {
    console.log('[失败] 订单不存在:', arg);
    process.exit(1);
  }
  const cols = orderRow[0].columns;
  const vals = orderRow[0].values[0];
  const row = {};
  cols.forEach((c, i) => (row[c] = vals[i]));
  if (!row.callback_url) {
    console.log('[失败] 商户未配置回调地址，请到 商户管理 中设置 callback_url');
    process.exit(1);
  }
  const data = {
    type: 'deposit',
    order_no: row.order_no,
    address: row.address,
    chain_type: row.chain_type,
    amount: String(row.amount),
    txid: row.txid || '',
    status: row.status,
    timestamp: Date.now().toString(),
  };
  const sorted = Object.keys(data).sort();
  const signStr = sorted.map((k) => `${k}=${data[k]}`).join('&') + `&secret=${row.api_secret}`;
  const sign = crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
  data.sign = sign;

  const axios = require('axios');
  try {
    const res = await axios.post(row.callback_url, data, { timeout: 10000, headers: { 'Content-Type': 'application/json' } });
    const ok = res?.data?.code === 0 || res?.data === 'SUCCESS' || res?.status === 200;
    console.log('[成功] 回调已发送', { url: row.callback_url, status: res.status });
    if (ok) {
      db.run(
        `UPDATE deposit_order SET callback_status = 1, callback_times = 1, update_time = datetime('now','localtime') WHERE order_no = ?`,
        [row.order_no]
      );
      db.exec('SELECT 1'); // trigger sql.js
      const out = db.export();
      fs.writeFileSync(dbPath, Buffer.from(out));
      console.log('[已更新] 数据库 callback_status=1');
    }
  } catch (e) {
    console.log('[失败] 回调发送失败:', e.message);
    process.exit(1);
  }
}

main();
