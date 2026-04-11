/**
 * 数据库初始化 & 迁移
 * v3: 新增 users, strategies(重构), strategy_versions, configurations,
 *     optimization_tasks, notifications 表
 * 保留旧表 strategies_legacy / backtests 做数据迁移
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'strategies.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: import('better-sqlite3').Database = new Database(DB_PATH);

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDB() {
  // ── v1/v2 兼容：保留旧表 ──────────────────────────────
  // 如果旧 strategies 表存在且没有 authorId 列，重命名为 legacy
  const hasOldTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='strategies'"
  ).get() as any;

  if (hasOldTable) {
    // 检查是否是旧结构（没有 authorId 列）
    const cols = db.prepare("PRAGMA table_info(strategies)").all() as any[];
    const colNames = cols.map((c: any) => c.name);
    if (!colNames.includes('authorId')) {
      // 旧结构，重命名
      db.exec(`ALTER TABLE strategies RENAME TO strategies_legacy;`);
      console.log('📦 Renamed old strategies table → strategies_legacy');
    }
  }

  // ── v3: 新表结构 ──────────────────────────────────────
  db.exec(`
    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      walletAddress TEXT UNIQUE,
      email TEXT UNIQUE,
      oauthProvider TEXT,
      oauthId TEXT,
      displayName TEXT,
      avatar TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 策略表（交易思路）
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      authorId TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      currentVersionId TEXT,
      forkFromId TEXT REFERENCES strategies(id),
      forkFromVersionId TEXT,
      isPublic INTEGER DEFAULT 1,
      robustnessScore REAL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'deprecated')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 版本表（代码）
    CREATE TABLE IF NOT EXISTS strategy_versions (
      id TEXT PRIMARY KEY,
      strategyId TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      code TEXT NOT NULL,
      paramSchema TEXT,
      changelog TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 配置表（执行环境 + 回测结果）
    CREATE TABLE IF NOT EXISTS configurations (
      id TEXT PRIMARY KEY,
      versionId TEXT NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
      strategyId TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      totalReturn REAL,
      maxDrawdown REAL,
      sharpeRatio REAL,
      winRate REAL,
      totalTrades INTEGER,
      equityCurve TEXT,
      inSampleSharpe REAL,
      outSampleSharpe REAL,
      paramSensitivity REAL,
      isPublished INTEGER DEFAULT 0,
      isOptimal INTEGER DEFAULT 0,
      optimizationTaskId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 优化任务表
    CREATE TABLE IF NOT EXISTS optimization_tasks (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      versionId TEXT NOT NULL REFERENCES strategy_versions(id),
      symbols TEXT NOT NULL,
      timeframes TEXT NOT NULL,
      paramRanges TEXT NOT NULL,
      optimizeTarget TEXT DEFAULT 'sharpe',
      totalBacktests INTEGER,
      estimatedMinutes REAL,
      priceUsdt REAL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','running','completed','failed')),
      progress REAL DEFAULT 0,
      currentBest TEXT,
      results TEXT,
      startedAt DATETIME,
      completedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 站内通知表
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 旧 backtests 表保留（向后兼容）
    CREATE TABLE IF NOT EXISTS backtests (
      id TEXT PRIMARY KEY,
      strategyId TEXT NOT NULL,
      period TEXT NOT NULL,
      totalReturn REAL NOT NULL DEFAULT 0,
      maxDrawdown REAL NOT NULL DEFAULT 0,
      sharpeRatio REAL NOT NULL DEFAULT 0,
      winRate REAL NOT NULL DEFAULT 0,
      totalTrades INTEGER NOT NULL DEFAULT 0,
      equityCurve TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(walletAddress);
    CREATE INDEX IF NOT EXISTS idx_strategies_author ON strategies(authorId);
    CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);
    CREATE INDEX IF NOT EXISTS idx_strategies_fork ON strategies(forkFromId);
    CREATE INDEX IF NOT EXISTS idx_versions_strategy ON strategy_versions(strategyId);
    CREATE INDEX IF NOT EXISTS idx_configurations_version ON configurations(versionId);
    CREATE INDEX IF NOT EXISTS idx_configurations_strategy ON configurations(strategyId);
    CREATE INDEX IF NOT EXISTS idx_configurations_symbol ON configurations(symbol);
    CREATE INDEX IF NOT EXISTS idx_optimization_user ON optimization_tasks(userId);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId);
    CREATE INDEX IF NOT EXISTS idx_backtests_strategyId ON backtests(strategyId);

    -- SIWE nonce 表（防重放）
    CREATE TABLE IF NOT EXISTS auth_nonces (
      nonce TEXT PRIMARY KEY,
      walletAddress TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL
    );
  `);

  // 清理过期 nonce
  db.prepare("DELETE FROM auth_nonces WHERE expiresAt < datetime('now')").run();
}

export default db;
