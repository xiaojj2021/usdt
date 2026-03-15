/**
 * 手动补录漏扫的充币订单
 * 用法: node scripts/fix-deposit.js [txid] [address] [amount] [merchant_id]
 * 示例: node scripts/fix-deposit.js 87473158c0c4222db14da323c2093f53b2eabc9578e4cdec6bf7c9a78607c084 TVuSNvx1R64LTjF3zn12QXupAeWAgr6Ngr 5 1
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');

async function main() {
  const dbPath = path.resolve(process.env.SQLITE_DB_PATH || './data/payment.db');
  const initSqlJs = require('sql.js');
  const fs = require('fs');

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  const txid = process.argv[2] || '87473158c0c4222db14da323c2093f53b2eabc9578e4cdec6bf7c9a78607c084';
  const address = process.argv[3] || 'TVuSNvx1R64LTjF3zn12QXupAeWAgr6Ngr';
  const amount = process.argv[4] || '5';
  const merchantId = parseInt(process.argv[5] || '1');

  const exists = db.exec(`SELECT id FROM deposit_order WHERE txid = '${txid.replace(/'/g, "''")}'`);
  if (exists.length > 0 && exists[0].values.length > 0) {
    console.log('[跳过] 该充币订单已存在');
    return;
  }

  const orderNo = 'DEP' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
  db.run(
    `INSERT INTO deposit_order (order_no, address, chain_type, amount, txid, confirmations, status, merchant_id) VALUES (?, ?, 'trc20', ?, ?, 20, 1, ?)`,
    [orderNo, address, amount, txid, merchantId]
  );
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log('[成功] 已补录充币订单:', { orderNo, address, amount, txid });
  console.log('请重启主服务或点击后台「手动补扫」触发回调通知商户');
}

main().catch((e) => {
  console.error('[失败]', e.message);
  process.exit(1);
});
