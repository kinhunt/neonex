/**
 * Auto-seed v3: 使用新数据模型
 * 创建 demo 用户 + 多个 demo 策略 + strategy_versions + configurations
 * 会补齐缺失 demo，而不是只在空库时运行
 */
import { v4 as uuidv4 } from 'uuid';
import db from './db';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const ALPHA_USER_ID = '00000000-0000-0000-0000-000000000002';
const VOLT_USER_ID = '00000000-0000-0000-0000-000000000003';
const TREND_USER_ID = '00000000-0000-0000-0000-000000000004';

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
  console.log('🌱 Ensuring demo market data exists...');

  const demoUsers = [
    { id: SYSTEM_USER_ID, wallet: '0x0000000000000000000000000000000000000000', displayName: 'SquirrelQuant' },
    { id: ALPHA_USER_ID, wallet: '0x1111111111111111111111111111111111111111', displayName: 'AlphaBot' },
    { id: VOLT_USER_ID, wallet: '0x2222222222222222222222222222222222222222', displayName: 'VolatilityLab' },
    { id: TREND_USER_ID, wallet: '0x3333333333333333333333333333333333333333', displayName: 'TrendForge' },
  ];

  for (const user of demoUsers) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, walletAddress, displayName, avatar)
      VALUES (?, ?, ?, ?)
    `).run(user.id, user.wallet, user.displayName, null);
  }

  const demos = [
    {
      name: 'SMA Cross',
      authorId: SYSTEM_USER_ID,
      description: '双均线交叉策略 — 快线上穿慢线买入，下穿卖出。最经典的趋势跟随策略。',
      code: SMA_CODE,
      params: { fast_period: 10, slow_period: 30 },
      tags: ['trend', 'moving-average', 'beginner'],
      robustnessScore: 76,
      configs: [
        { symbol: 'WOKB/USDT', timeframe: '1h', totalReturn: 42.5, maxDrawdown: -15.3, sharpeRatio: 1.82, winRate: 58.2, totalTrades: 127, isOptimal: true },
        { symbol: 'XETH/USDT', timeframe: '4h', totalReturn: 38.1, maxDrawdown: -12.8, sharpeRatio: 1.65, winRate: 55.4, totalTrades: 89, isOptimal: false },
      ],
    },
    {
      name: 'RSI Reversal',
      authorId: ALPHA_USER_ID,
      description: 'RSI 超买超卖反转策略 — RSI 低于 30 买入，高于 70 卖出。经典的均值回归策略。',
      code: RSI_CODE,
      params: { rsi_period: 14, overbought: 70, oversold: 30 },
      tags: ['mean-reversion', 'rsi', 'oscillator'],
      robustnessScore: 82,
      configs: [
        { symbol: 'WOKB/USDT', timeframe: '4h', totalReturn: 28.7, maxDrawdown: -8.6, sharpeRatio: 2.14, winRate: 64.8, totalTrades: 203, isOptimal: true },
        { symbol: 'XSOL/USDT', timeframe: '1h', totalReturn: 22.3, maxDrawdown: -10.2, sharpeRatio: 1.78, winRate: 61.2, totalTrades: 156, isOptimal: false },
      ],
    },
    {
      name: 'Bollinger Breakout',
      authorId: VOLT_USER_ID,
      description: '布林带突破策略 — 价格突破上轨时买入，回到中轨时平仓。适合波动率扩张行情。',
      code: BB_CODE,
      params: { bb_period: 20, bb_std: 2.0 },
      tags: ['volatility', 'breakout', 'bollinger'],
      robustnessScore: 74,
      configs: [
        { symbol: 'XBTC/USDT', timeframe: '4h', totalReturn: 35.1, maxDrawdown: -12.4, sharpeRatio: 1.95, winRate: 55.6, totalTrades: 89, isOptimal: true },
        { symbol: 'WOKB/USDT', timeframe: '1h', totalReturn: 29.8, maxDrawdown: -14.1, sharpeRatio: 1.72, winRate: 52.3, totalTrades: 112, isOptimal: false },
      ],
    },
    {
      name: 'Fast SMA Momentum',
      authorId: TREND_USER_ID,
      description: '更激进的双均线动量版本，适合高波动品种的短周期趋势跟随。',
      code: SMA_CODE,
      params: { fast_period: 5, slow_period: 18 },
      tags: ['trend', 'momentum', 'fast'],
      robustnessScore: 68,
      configs: [
        { symbol: 'XSOL/USDT', timeframe: '1h', totalReturn: 57.4, maxDrawdown: -21.5, sharpeRatio: 1.74, winRate: 49.8, totalTrades: 241, isOptimal: true },
        { symbol: 'XETH/USDT', timeframe: '1h', totalReturn: 43.9, maxDrawdown: -18.3, sharpeRatio: 1.58, winRate: 51.1, totalTrades: 186, isOptimal: false },
      ],
    },
    {
      name: 'Conservative Trend Filter',
      authorId: SYSTEM_USER_ID,
      description: '更保守的趋势过滤策略，降低交易频率，追求更稳定的风险调整后收益。',
      code: SMA_CODE,
      params: { fast_period: 20, slow_period: 50 },
      tags: ['trend', 'defensive', 'swing'],
      robustnessScore: 88,
      configs: [
        { symbol: 'XBTC/USDT', timeframe: '1d', totalReturn: 48.2, maxDrawdown: -11.2, sharpeRatio: 2.28, winRate: 57.6, totalTrades: 46, isOptimal: true },
        { symbol: 'WOKB/USDT', timeframe: '4h', totalReturn: 34.2, maxDrawdown: -9.4, sharpeRatio: 2.01, winRate: 59.1, totalTrades: 61, isOptimal: false },
      ],
    },
    {
      name: 'Deep RSI Snapback',
      authorId: ALPHA_USER_ID,
      description: '专注于更深超卖后的反弹捕捉，信号更少，但期望单次反弹更强。',
      code: RSI_CODE,
      params: { rsi_period: 10, overbought: 68, oversold: 22 },
      tags: ['mean-reversion', 'snapback', 'counter-trend'],
      robustnessScore: 71,
      configs: [
        { symbol: 'XETH/USDT', timeframe: '4h', totalReturn: 31.6, maxDrawdown: -9.1, sharpeRatio: 1.89, winRate: 63.4, totalTrades: 128, isOptimal: true },
        { symbol: 'XSOL/USDT', timeframe: '4h', totalReturn: 27.1, maxDrawdown: -11.6, sharpeRatio: 1.63, winRate: 60.7, totalTrades: 117, isOptimal: false },
      ],
    },
    {
      name: 'Range Reclaim RSI',
      authorId: ALPHA_USER_ID,
      description: '适合震荡市场的 RSI 区间回归策略，强调高胜率和浅回撤。',
      code: RSI_CODE,
      params: { rsi_period: 18, overbought: 72, oversold: 28 },
      tags: ['range', 'high-winrate', 'rsi'],
      robustnessScore: 84,
      configs: [
        { symbol: 'WOKB/USDT', timeframe: '1h', totalReturn: 24.8, maxDrawdown: -6.9, sharpeRatio: 2.31, winRate: 67.5, totalTrades: 188, isOptimal: true },
        { symbol: 'XBTC/USDT', timeframe: '4h', totalReturn: 19.3, maxDrawdown: -7.8, sharpeRatio: 1.96, winRate: 64.2, totalTrades: 104, isOptimal: false },
      ],
    },
    {
      name: 'Volatility Expansion Hunter',
      authorId: VOLT_USER_ID,
      description: '专注波动率扩张阶段的布林带突破，适合趋势启动初期。',
      code: BB_CODE,
      params: { bb_period: 18, bb_std: 2.4 },
      tags: ['volatility', 'trend-start', 'expansion'],
      robustnessScore: 79,
      configs: [
        { symbol: 'XSOL/USDT', timeframe: '4h', totalReturn: 44.3, maxDrawdown: -13.8, sharpeRatio: 2.02, winRate: 54.1, totalTrades: 97, isOptimal: true },
        { symbol: 'XETH/USDT', timeframe: '1h', totalReturn: 36.5, maxDrawdown: -15.1, sharpeRatio: 1.71, winRate: 50.2, totalTrades: 141, isOptimal: false },
      ],
    },
    {
      name: 'Mean Reversion Bollinger Fade',
      authorId: VOLT_USER_ID,
      description: '在极端偏离布林带后做均值回归，适合高波动震荡环境。',
      code: BB_CODE,
      params: { bb_period: 24, bb_std: 2.8 },
      tags: ['mean-reversion', 'bollinger', 'fade'],
      robustnessScore: 73,
      configs: [
        { symbol: 'WOKB/USDT', timeframe: '4h', totalReturn: 26.9, maxDrawdown: -10.7, sharpeRatio: 1.84, winRate: 61.8, totalTrades: 92, isOptimal: true },
        { symbol: 'XBTC/USDT', timeframe: '1h', totalReturn: 21.4, maxDrawdown: -12.2, sharpeRatio: 1.52, winRate: 58.6, totalTrades: 144, isOptimal: false },
      ],
    },
  ];

  let added = 0;

  for (const s of demos) {
    const existing = db.prepare('SELECT id FROM strategies WHERE name = ?').get(s.name) as any;
    if (existing?.id) continue;

    const strategyId = uuidv4();
    const versionId = uuidv4();

    db.prepare(`
      INSERT INTO strategies (id, authorId, name, description, tags, currentVersionId, robustnessScore)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(strategyId, s.authorId, s.name, s.description, JSON.stringify(s.tags), versionId, s.robustnessScore);

    db.prepare(`
      INSERT INTO strategy_versions (id, strategyId, version, code, paramSchema, changelog)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(versionId, strategyId, 'v1', s.code, JSON.stringify(s.params), 'Initial demo version');

    for (const cfg of s.configs) {
      const configId = uuidv4();
      const equityCurve = generateEquityCurve(10000, cfg.totalReturn, 365, 0.012);

      db.prepare(`
        INSERT INTO configurations (id, versionId, strategyId, symbol, timeframe, params, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve, isOptimal, isPublished)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        configId,
        versionId,
        strategyId,
        cfg.symbol,
        cfg.timeframe,
        JSON.stringify(s.params),
        cfg.totalReturn,
        cfg.maxDrawdown,
        cfg.sharpeRatio,
        cfg.winRate,
        cfg.totalTrades,
        JSON.stringify(equityCurve),
        cfg.isOptimal ? 1 : 0,
        cfg.isOptimal ? 1 : 0,
      );
    }

    const bt = s.configs[0];
    const btId = uuidv4();
    db.prepare(`
      INSERT INTO backtests (id, strategyId, period, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      btId,
      strategyId,
      '2025-01-01 to 2026-01-01',
      bt.totalReturn,
      bt.maxDrawdown,
      bt.sharpeRatio,
      bt.winRate,
      bt.totalTrades,
      JSON.stringify(generateEquityCurve(10000, bt.totalReturn, 365, 0.012)),
    );

    added += 1;
    console.log(`  ✅ Added demo strategy: ${s.name}`);
  }

  const total = (db.prepare('SELECT COUNT(*) as c FROM strategies').get() as any).c;
  console.log(`🐿️ Demo market ready. Added ${added}, total strategies now ${total}.`);
}
