/**
 * XLayer 标的路由
 * GET /api/symbols — 返回支持的标的列表
 */
import { Router, Request, Response } from 'express';
import { getAllSymbols, getAvailableSymbols, SUPPORTED_TIMEFRAMES, mapToCcxtSymbol } from '../symbols';

const router = Router();

/**
 * GET /api/symbols
 * query: { available?: 'true' | 'false' }
 * → { symbols: XLayerToken[], timeframes: string[] }
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const onlyAvailable = _req.query.available !== 'false';
    const symbols = onlyAvailable ? getAvailableSymbols() : getAllSymbols();

    res.json({
      symbols,
      timeframes: [...SUPPORTED_TIMEFRAMES],
      defaultSymbol: 'WOKB/USDT',
      defaultTimeframe: '1h',
    });
  } catch (err: any) {
    console.error('GET /api/symbols error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/symbols/map/:symbol
 * 将 XLayer symbol 映射到 ccxt symbol
 * → { xlayerSymbol, ccxtSymbol, exchange }
 */
router.get('/map/:symbol', (req: Request, res: Response) => {
  try {
    const xlayerSymbol = decodeURIComponent(req.params.symbol);
    const ccxtSymbol = mapToCcxtSymbol(xlayerSymbol);

    if (!ccxtSymbol) {
      return res.status(404).json({ error: `No ccxt mapping for symbol: ${xlayerSymbol}` });
    }

    res.json({
      xlayerSymbol,
      ccxtSymbol,
      exchange: 'okx',
      note: 'Data sourced from OKX CEX (equivalent pair)',
    });
  } catch (err: any) {
    console.error('GET /api/symbols/map error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
