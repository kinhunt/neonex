import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { initDB } from './db';
import db from './db';
import fs from 'fs';
import path from 'path';

// Init DB tables
initDB();

// Clear existing data
db.exec('DELETE FROM backtests');
db.exec('DELETE FROM strategies');

console.log('🌱 Seeding strategies (Python format)...');

// Read Python strategy files from engine/strategies/
const engineDir = path.join(__dirname, '..', '..', 'engine', 'strategies');

function readStrategyCode(filename: string): string {
  const filePath = path.join(engineDir, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  // Extract STRATEGY_CODE string from the Python file
  const match = content.match(/STRATEGY_CODE\s*=\s*'''([\s\S]*?)'''/);
  if (match) return match[1].trim();
  // Fallback: extract the core code (everything before STRATEGY_CODE/STRATEGY_META)
  const lines = content.split('\n');
  const codeLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('STRATEGY_CODE') || line.startsWith('STRATEGY_META')) break;
    codeLines.push(line);
  }
  return codeLines.join('\n').trim();
}

const smaCrossCode = readStrategyCode('sma_cross.py');
const rsiReversalCode = readStrategyCode('rsi_reversal.py');
const bollingerCode = readStrategyCode('bollinger_breakout.py');

// --- Strategy 1: SMA Cross ---
const smaId = uuidv4();
const smaStrategyId = '0x' + crypto.createHash('sha256').update(smaId).digest('hex').slice(0, 64);

db.prepare(`
  INSERT INTO strategies (id, strategyId, name, description, author, authorName, code, config, version, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  smaId,
  smaStrategyId,
  'SMA Cross',
  '双均线交叉策略 — 快线上穿慢线买入，下穿卖出。最经典的趋势跟随策略。',
  '0x1234567890abcdef1234567890abcdef12345678',
  'SquirrelQuant',
  smaCrossCode,
  JSON.stringify({
    fast_period: 10,
    slow_period: 30,
  }),
  '1.0.0',
  JSON.stringify(['trend', 'moving-average', 'beginner']),
);

console.log(`  ✅ SMA Cross strategy: ${smaId}`);

// --- Strategy 2: RSI Reversal ---
const rsiId = uuidv4();
const rsiStrategyId = '0x' + crypto.createHash('sha256').update(rsiId).digest('hex').slice(0, 64);

db.prepare(`
  INSERT INTO strategies (id, strategyId, name, description, author, authorName, code, config, version, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  rsiId,
  rsiStrategyId,
  'RSI Reversal',
  'RSI 超买超卖反转策略 — RSI 低于 30 买入，高于 70 卖出。经典的均值回归策略。',
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  'AlphaBot',
  rsiReversalCode,
  JSON.stringify({
    rsi_period: 14,
    overbought: 70,
    oversold: 30,
  }),
  '1.0.0',
  JSON.stringify(['mean-reversion', 'rsi', 'oscillator']),
);

console.log(`  ✅ RSI Reversal strategy: ${rsiId}`);

// --- Strategy 3: Bollinger Breakout ---
const bbId = uuidv4();
const bbStrategyId = '0x' + crypto.createHash('sha256').update(bbId).digest('hex').slice(0, 64);

db.prepare(`
  INSERT INTO strategies (id, strategyId, name, description, author, authorName, code, config, version, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  bbId,
  bbStrategyId,
  'Bollinger Breakout',
  '布林带突破策略 — 价格突破上轨时买入，回到中轨时平仓。适合波动率扩张行情。',
  '0x1234567890abcdef1234567890abcdef12345678',
  'SquirrelQuant',
  bollingerCode,
  JSON.stringify({
    bb_period: 20,
    bb_std: 2.0,
  }),
  '1.0.0',
  JSON.stringify(['volatility', 'breakout', 'bollinger']),
);

console.log(`  ✅ Bollinger Breakout strategy: ${bbId}`);

// --- Backtest data ---
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

// SMA Cross backtest
const smaBacktestId = uuidv4();
db.prepare(`
  INSERT INTO backtests (id, strategyId, period, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(smaBacktestId, smaId, '2025-01-01 to 2026-01-01', 42.5, -15.3, 1.82, 58.2, 127, JSON.stringify(generateEquityCurve(10000, 42.5, 365, 0.015)));

// RSI Reversal backtest
const rsiBacktestId = uuidv4();
db.prepare(`
  INSERT INTO backtests (id, strategyId, period, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(rsiBacktestId, rsiId, '2025-01-01 to 2026-01-01', 28.7, -8.6, 2.14, 64.8, 203, JSON.stringify(generateEquityCurve(10000, 28.7, 365, 0.008)));

// Bollinger Breakout backtest
const bbBacktestId = uuidv4();
db.prepare(`
  INSERT INTO backtests (id, strategyId, period, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(bbBacktestId, bbId, '2025-01-01 to 2026-01-01', 35.1, -12.4, 1.95, 55.6, 89, JSON.stringify(generateEquityCurve(10000, 35.1, 365, 0.012)));

// Verify
const count = (db.prepare('SELECT COUNT(*) as c FROM strategies').get() as any).c;
const btCount = (db.prepare('SELECT COUNT(*) as c FROM backtests').get() as any).c;
console.log(`\n🐿️ Seed complete! ${count} strategies, ${btCount} backtests.`);
