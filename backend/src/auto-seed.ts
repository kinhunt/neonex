/**
 * Auto-seed v3: 使用新数据模型
 * 创建 system 用户 + 3 个 demo 策略 + strategy_versions + configurations
 */
import { v4 as uuidv4 } from 'uuid';
import db from './db';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const SMA_CODE = `from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd

def SMA(values, n):
    return pd.Series(values).rolling(n).mean().values

class SmaCross(Strategy):
    fast_period = 10
    slow_period = 30

    def init(self):
        close = self.data.Close
        self.fast_ma = self.I(SMA, close, self.fast_period)
        self.slow_ma = self.I(SMA, close, self.slow_period)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            self.sell()`;

const RSI_CODE = `from backtesting import Strategy
import pandas as pd
import numpy as np

def RSI(values, period=14):
    delta = pd.Series(values).diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return (100 - (100 / (1 + rs))).values

class RsiReversal(Strategy):
    rsi_period = 14
    overbought = 70
    oversold = 30

    def init(self):
        self.rsi = self.I(RSI, self.data.Close, self.rsi_period)

    def next(self):
        if self.rsi[-1] < self.oversold and not self.position:
            self.buy()
        elif self.rsi[-1] > self.overbought and self.position:
            self.sell()`;

const BB_CODE = `from backtesting import Strategy
import pandas as pd
import numpy as np

def BollingerBands(values, period=20, std=2.0):
    s = pd.Series(values)
    mid = s.rolling(period).mean()
    std_dev = s.rolling(period).std()
    upper = (mid + std * std_dev).values
    lower = (mid - std * std_dev).values
    return mid.values, upper, lower

class BollingerBreakout(Strategy):
    bb_period = 20
    bb_std = 2.0

    def init(self):
        close = self.data.Close
        self.mid, self.upper, self.lower = self.I(BollingerBands, close, self.bb_period, self.bb_std, overlay=True)

    def next(self):
        if self.data.Close[-1] > self.upper[-1] and not self.position:
            self.buy()
        elif self.data.Close[-1] < self.mid[-1] and self.position:
            self.sell()`;

function generateEquityCurve(startValue: number, totalReturn: number, points: number, volatility: number): number[] {
  const curve: number[] = [startValue];
  const dailyReturn = Math.pow(1 + totalReturn / 100, 1 / points) - 1;
  for (let i = 1; i < points; i++) {
    const noise = (Math.random() - 0.5) * 2 * volatility;
    const prev = curve[i - 1];
    curve.push(Math.round((prev * (1 + dailyReturn + noise)) * 100) / 100);
  }
  return curve;
}

export function autoSeed() {
  // 检查新表是否已有数据
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const stratCount = (db.prepare('SELECT COUNT(*) as c FROM strategies').get() as any).c;

  if (stratCount > 0) {
    console.log(`📊 ${stratCount} strategies already exist, skipping auto-seed.`);
    return;
  }

  console.log('🌱 Auto-seeding v3 demo data...');

  // 1. 创建 system 用户
  if (userCount === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, walletAddress, displayName, avatar)
      VALUES (?, ?, ?, ?)
    `).run(SYSTEM_USER_ID, '0x0000000000000000000000000000000000000000', 'SquirrelQuant', null);
    console.log('  👤 Created system user: SquirrelQuant');
  }

  // 2. Seed demo 策略
  const demos = [
    {
      name: 'SMA Cross',
      description: '双均线交叉策略 — 快线上穿慢线买入，下穿卖出。最经典的趋势跟随策略。',
      code: SMA_CODE,
      params: { fast_period: 10, slow_period: 30 },
      tags: ['trend', 'moving-average', 'beginner'],
      configs: [
        { symbol: 'WOKB/USDT', timeframe: '1h', totalReturn: 42.5, maxDrawdown: -15.3, sharpeRatio: 1.82, winRate: 58.2, totalTrades: 127, isOptimal: true },
        { symbol: 'XETH/USDT', timeframe: '4h', totalReturn: 38.1, maxDrawdown: -12.8, sharpeRatio: 1.65, winRate: 55.4, totalTrades: 89, isOptimal: false },
        { symbol: 'XBTC/USDT', timeframe: '1d', totalReturn: 51.2, maxDrawdown: -18.5, sharpeRatio: 2.01, winRate: 60.1, totalTrades: 64, isOptimal: false },
      ],
    },
    {
      name: 'RSI Reversal',
      description: 'RSI 超买超卖反转策略 — RSI 低于 30 买入，高于 70 卖出。经典的均值回归策略。',
      code: RSI_CODE,
      params: { rsi_period: 14, overbought: 70, oversold: 30 },
      tags: ['mean-reversion', 'rsi', 'oscillator'],
      configs: [
        { symbol: 'WOKB/USDT', timeframe: '4h', totalReturn: 28.7, maxDrawdown: -8.6, sharpeRatio: 2.14, winRate: 64.8, totalTrades: 203, isOptimal: true },
        { symbol: 'XSOL/USDT', timeframe: '1h', totalReturn: 22.3, maxDrawdown: -10.2, sharpeRatio: 1.78, winRate: 61.2, totalTrades: 156, isOptimal: false },
      ],
    },
    {
      name: 'Bollinger Breakout',
      description: '布林带突破策略 — 价格突破上轨时买入，回到中轨时平仓。适合波动率扩张行情。',
      code: BB_CODE,
      params: { bb_period: 20, bb_std: 2.0 },
      tags: ['volatility', 'breakout', 'bollinger'],
      configs: [
        { symbol: 'XBTC/USDT', timeframe: '4h', totalReturn: 35.1, maxDrawdown: -12.4, sharpeRatio: 1.95, winRate: 55.6, totalTrades: 89, isOptimal: true },
        { symbol: 'WOKB/USDT', timeframe: '1h', totalReturn: 29.8, maxDrawdown: -14.1, sharpeRatio: 1.72, winRate: 52.3, totalTrades: 112, isOptimal: false },
      ],
    },
  ];

  for (const s of demos) {
    const strategyId = uuidv4();
    const versionId = uuidv4();

    // 创建策略
    db.prepare(`
      INSERT INTO strategies (id, authorId, name, description, tags, currentVersionId, robustnessScore)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(strategyId, SYSTEM_USER_ID, s.name, s.description, JSON.stringify(s.tags), versionId, Math.round(Math.random() * 30 + 60));

    // 创建 v1 版本
    db.prepare(`
      INSERT INTO strategy_versions (id, strategyId, version, code, paramSchema, changelog)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(versionId, strategyId, 'v1', s.code, JSON.stringify(s.params), 'Initial version');

    // 创建配置（含回测结果）
    for (const cfg of s.configs) {
      const configId = uuidv4();
      const equityCurve = generateEquityCurve(10000, cfg.totalReturn, 365, 0.012);

      db.prepare(`
        INSERT INTO configurations (id, versionId, strategyId, symbol, timeframe, params, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve, isOptimal, isPublished)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        configId, versionId, strategyId,
        cfg.symbol, cfg.timeframe, JSON.stringify(s.params),
        cfg.totalReturn, cfg.maxDrawdown, cfg.sharpeRatio, cfg.winRate, cfg.totalTrades,
        JSON.stringify(equityCurve),
        cfg.isOptimal ? 1 : 0,
        cfg.isOptimal ? 1 : 0,
      );
    }

    // 也向 backtests 表写一条（向后兼容前端）
    const bt = s.configs[0];
    const btId = uuidv4();
    db.prepare(`
      INSERT INTO backtests (id, strategyId, period, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(btId, strategyId, '2025-01-01 to 2026-01-01', bt.totalReturn, bt.maxDrawdown, bt.sharpeRatio, bt.winRate, bt.totalTrades,
      JSON.stringify(generateEquityCurve(10000, bt.totalReturn, 365, 0.012)));

    console.log(`  ✅ ${s.name}: ${strategyId} (${s.configs.length} configs)`);
  }

  console.log('🐿️ Auto-seed v3 complete!');
}
