/**
 * SQLite 数据库连接（基于 sql.js，纯 WASM 无需编译）
 * 提供与 better-sqlite3 兼容的同步 API 封装
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(process.env.SQLITE_DB_PATH || './data/payment.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let sqlDb = null;
let saveTimer = null;

class PreparedStatement {
  constructor(db, sql) {
    this._db = db;
    this._sql = sql;
  }

  _flatParams(args) {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  get(...args) {
    const params = this._flatParams(args);
    let stmt;
    try {
      stmt = this._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return undefined;
    } finally {
      if (stmt) stmt.free();
    }
  }

  all(...args) {
    const params = this._flatParams(args);
    let stmt;
    try {
      stmt = this._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      return results;
    } finally {
      if (stmt) stmt.free();
    }
  }

  run(...args) {
    const params = this._flatParams(args);
    this._db.run(this._sql, params);
    const lastId = this._db.exec("SELECT last_insert_rowid() AS id");
    const changes = this._db.getRowsModified();
    const lastInsertRowid = lastId.length > 0 ? lastId[0].values[0][0] : 0;
    scheduleSave();
    return { lastInsertRowid, changes };
  }
}

class DatabaseWrapper {
  constructor(sqliteDb) {
    this.db = sqliteDb;
  }

  prepare(sql) {
    return new PreparedStatement(this.db, sql);
  }

  exec(sql) {
    this.db.run(sql);
    scheduleSave();
  }

  pragma(_str) {
    // sql.js 不完全支持 pragma
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self.db.run("BEGIN TRANSACTION");
      try {
        const result = fn(...args);
        self.db.run("COMMIT");
        scheduleSave();
        return result;
      } catch (e) {
        self.db.run("ROLLBACK");
        throw e;
      }
    };
  }

  close() {
    saveToDisk();
    this.db.close();
  }
}

function saveToDisk() {
  if (!sqlDb) return;
  try {
    const data = sqlDb.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (err) {
    console.error('[数据库] 保存失败:', err.message);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToDisk, 200);
}

let dbWrapper = null;
let initPromise = null;

async function initDatabase() {
  if (dbWrapper) return dbWrapper;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      sqlDb = new SQL.Database(fileBuffer);
    } else {
      sqlDb = new SQL.Database();
    }

    dbWrapper = new DatabaseWrapper(sqlDb);

    process.on('exit', () => saveToDisk());
    process.on('SIGINT', () => { saveToDisk(); process.exit(0); });
    process.on('SIGTERM', () => { saveToDisk(); process.exit(0); });

    return dbWrapper;
  })();

  return initPromise;
}

/**
 * 代理对象：透传所有调用到已初始化的 dbWrapper
 * 保留 initDatabase / saveToDisk 为特殊属性
 */
const specialProps = { initDatabase, saveToDisk };

const dbProxy = new Proxy({}, {
  get(_target, prop) {
    if (prop in specialProps) return specialProps[prop];
    if (!dbWrapper) throw new Error('数据库尚未初始化，请先调用 initDatabase()');
    const val = dbWrapper[prop];
    if (typeof val === 'function') return val.bind(dbWrapper);
    return val;
  }
});

module.exports = dbProxy;
