/**
 * Layer 1 Strategy Market API — v3 主入口
 * 新增：钱包登录 / 策略版本+配置 / XLayer 标的
 */
import express from 'express';
import cors from 'cors';
import { initDB } from './db';
import { autoSeed } from './auto-seed';
import authRouter from './routes/auth';
import strategiesRouter from './routes/strategies';
import backtestRouter from './routes/backtest';
import aiRouter from './routes/ai';
import symbolsRouter from './routes/symbols';

const app = express();
const PORT = parseInt(process.env.PORT || '3100', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Init database & auto-seed
initDB();
autoSeed();

// Routes
app.use('/api/auth', authRouter);
app.use('/api/strategies', strategiesRouter);
app.use('/api/strategies', backtestRouter);  // mounts /:id/backtest/run under /api/strategies
app.use('/api/ai', aiRouter);
app.use('/api/symbols', symbolsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: 'v3', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐿️ Layer 1 Strategy Market API v3 running on http://0.0.0.0:${PORT}`);
  console.log(`  🔐 Auth:       /api/auth/challenge | verify | me | profile`);
  console.log(`  📊 Strategies: /api/strategies`);
  console.log(`  🧪 Backtest:   /api/strategies/:id/backtest/run`);
  console.log(`  🤖 AI:         /api/ai/generate-strategy | improve-strategy | explain-strategy`);
  console.log(`  💎 Symbols:    /api/symbols`);
});

export default app;
