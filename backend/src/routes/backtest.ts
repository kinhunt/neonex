/**
 * 回测代理路由
 * POST /api/strategies/:id/backtest/run — 转发到 Python 引擎执行回测
 * 支持 XLayer 标的自动映射到 ccxt symbol
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { mapToCcxtSymbol } from '../symbols';

const router = Router();

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:3200';

/**
 * POST /api/strategies/:id/backtest/run
 * 从数据库读取策略代码 → 映射标的 → 转发到 Python 引擎 → 存入结果 → 返回
 */
router.post('/:id/backtest/run', async (req: Request, res: Response) => {
  try {
    // 1. 尝试新表
    let strategyRow = db.prepare(`
      SELECT s.id, sv.code
      FROM strategies s
      LEFT JOIN strategy_versions sv ON sv.id = s.currentVersionId
      WHERE s.id = ?
    `).get(req.params.id) as any;

    let code: string;

    if (strategyRow && strategyRow.code) {
      code = strategyRow.code;
    } else {
      // 向后兼容：查旧表
      const legacyExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='strategies_legacy'").get();
      if (legacyExists) {
        const legacy = db.prepare('SELECT * FROM strategies_legacy WHERE id = ?').get(req.params.id) as any;
        if (legacy) {
          code = legacy.code;
        } else {
          return res.status(404).json({ error: 'Strategy not found' });
        }
      } else {
        return res.status(404).json({ error: 'Strategy not found' });
      }
    }

    const { symbol, timeframe, period } = req.body;

    // 2. XLayer 标的映射
    let ccxtSymbol = symbol;
    let xlayerSymbol = symbol;
    if (symbol) {
      const mapped = mapToCcxtSymbol(symbol);
      if (mapped) {
        ccxtSymbol = mapped; // 发给引擎的用 ccxt symbol
        xlayerSymbol = symbol; // 前端显示用 XLayer symbol
      }
    }

    // 3. 调用 Python 引擎
    const enginePayload: any = { code };
    if (ccxtSymbol) enginePayload.symbol = ccxtSymbol;
    if (timeframe) enginePayload.timeframe = timeframe;
    if (period) enginePayload.period = period;

    const engineRes = await fetch(`${PYTHON_ENGINE_URL}/engine/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enginePayload),
    });

    if (!engineRes.ok) {
      const errBody = await engineRes.text();
      return res.status(502).json({ error: 'Python engine backtest failed', detail: errBody });
    }

    const engineResult = await engineRes.json() as any;

    // 4. 存入 backtests 表（向后兼容）
    const backtestId = uuidv4();
    const periodStr = period || engineResult.period || 'default';
    const totalReturn = engineResult.total_return ?? engineResult.totalReturn ?? 0;
    const maxDrawdown = engineResult.max_drawdown ?? engineResult.maxDrawdown ?? 0;
    const sharpeRatio = engineResult.sharpe_ratio ?? engineResult.sharpeRatio ?? 0;
    const winRate = engineResult.win_rate ?? engineResult.winRate ?? 0;
    const totalTrades = engineResult.total_trades ?? engineResult.totalTrades ?? 0;
    const equityCurve = engineResult.equity_curve ?? engineResult.equityCurve ?? [];

    db.prepare(`
      INSERT INTO backtests (id, strategyId, period, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(backtestId, req.params.id, periodStr, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, JSON.stringify(equityCurve));

    // 5. 如果有新数据模型的策略，同时存入 configurations 表
    if (strategyRow && strategyRow.code) {
      const strategy = db.prepare('SELECT currentVersionId FROM strategies WHERE id = ?').get(req.params.id) as any;
      if (strategy?.currentVersionId) {
        const configId = uuidv4();
        db.prepare(`
          INSERT INTO configurations (id, versionId, strategyId, symbol, timeframe, params, totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          configId, strategy.currentVersionId, req.params.id,
          xlayerSymbol || 'WOKB/USDT', timeframe || '1h', '{}',
          totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, JSON.stringify(equityCurve),
        );
      }
    }

    // 6. 返回结果
    res.json({
      id: backtestId,
      strategyId: req.params.id,
      symbol: xlayerSymbol,
      ccxtSymbol,
      timeframe: timeframe || '1h',
      period: periodStr,
      totalReturn,
      maxDrawdown,
      sharpeRatio,
      winRate,
      totalTrades,
      equityCurve,
      engineResult,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('POST /api/strategies/:id/backtest/run error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
