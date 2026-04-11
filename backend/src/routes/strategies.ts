/**
 * 策略 CRUD 路由（v3 新数据模型）
 * 包含：策略列表/详情/创建/版本/配置/Fork/发布
 * 保留向后兼容的旧端点格式
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

// ─── GET /api/strategies — 策略列表（公开，支持标的筛选）─────────────
router.get('/', optionalAuth, (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const symbol = req.query.symbol as string;
    const tag = req.query.tag as string;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = ["s.isPublic = 1"];
    const params: any[] = [];

    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }

    if (tag) {
      conditions.push("s.tags LIKE ?");
      params.push(`%"${tag}"%`);
    }

    if (search) {
      conditions.push('(s.name LIKE ? OR s.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (symbol) {
      conditions.push('EXISTS (SELECT 1 FROM configurations c2 WHERE c2.strategyId = s.id AND c2.symbol = ?)');
      params.push(symbol);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 允许的排序字段
    const allowedSorts: Record<string, string> = {
      createdAt: 's.createdAt',
      name: 's.name',
      totalReturn: 'COALESCE(cfg.totalReturn, 0)',
      sharpeRatio: 'COALESCE(cfg.sharpeRatio, 0)',
      robustnessScore: 'COALESCE(s.robustnessScore, 0)',
    };
    const orderColumn = allowedSorts[sortBy] || 's.createdAt';

    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM strategies s
      LEFT JOIN configurations cfg ON cfg.strategyId = s.id AND cfg.isOptimal = 1
      ${where}
    `).get(...params) as any;
    const total = countRow.total;

    const rows = db.prepare(`
      SELECT s.*,
             u.walletAddress as authorWallet,
             u.displayName as authorName,
             u.avatar as authorAvatar,
             cfg.totalReturn as cfg_totalReturn,
             cfg.sharpeRatio as cfg_sharpeRatio,
             cfg.maxDrawdown as cfg_maxDrawdown,
             cfg.winRate as cfg_winRate,
             cfg.totalTrades as cfg_totalTrades,
             cfg.symbol as cfg_symbol,
             cfg.timeframe as cfg_timeframe
      FROM strategies s
      LEFT JOIN users u ON u.id = s.authorId
      LEFT JOIN (
        SELECT strategyId, totalReturn, sharpeRatio, maxDrawdown, winRate, totalTrades, symbol, timeframe,
               ROW_NUMBER() OVER (PARTITION BY strategyId ORDER BY isOptimal DESC, sharpeRatio DESC) as rn
        FROM configurations
      ) cfg ON cfg.strategyId = s.id AND cfg.rn = 1
      ${where}
      ORDER BY ${orderColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const strategies = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tags: JSON.parse(row.tags || '[]'),
      author: {
        id: row.authorId,
        walletAddress: row.authorWallet,
        displayName: row.authorName,
        avatar: row.authorAvatar,
      },
      currentVersionId: row.currentVersionId,
      forkFromId: row.forkFromId,
      isPublic: !!row.isPublic,
      robustnessScore: row.robustnessScore,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // 最优配置的表现指标（向后兼容 performance 字段）
      performance: row.cfg_totalReturn != null ? {
        totalReturn: row.cfg_totalReturn,
        sharpeRatio: row.cfg_sharpeRatio,
        maxDrawdown: row.cfg_maxDrawdown,
        winRate: row.cfg_winRate,
        totalTrades: row.cfg_totalTrades,
        symbol: row.cfg_symbol,
        timeframe: row.cfg_timeframe,
      } : null,
      // 向后兼容 backtest 字段
      backtest: row.cfg_totalReturn != null ? {
        totalReturn: row.cfg_totalReturn,
        sharpeRatio: row.cfg_sharpeRatio,
        maxDrawdown: row.cfg_maxDrawdown,
        winRate: row.cfg_winRate,
      } : null,
    }));

    res.json({
      data: strategies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('GET /api/strategies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/strategies/:id — 策略详情 ───────────────────────────
router.get('/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT s.*, u.walletAddress as authorWallet, u.displayName as authorName, u.avatar as authorAvatar
      FROM strategies s
      LEFT JOIN users u ON u.id = s.authorId
      WHERE s.id = ?
    `).get(req.params.id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // 获取版本列表
    const versions = db.prepare(
      'SELECT id, version, changelog, paramSchema, createdAt FROM strategy_versions WHERE strategyId = ? ORDER BY createdAt DESC'
    ).all(req.params.id) as any[];

    // 获取当前版本的代码
    let currentVersion: any = null;
    if (row.currentVersionId) {
      currentVersion = db.prepare('SELECT * FROM strategy_versions WHERE id = ?').get(row.currentVersionId) as any;
    } else if (versions.length > 0) {
      currentVersion = db.prepare('SELECT * FROM strategy_versions WHERE id = ?').get(versions[0].id) as any;
    }

    // 获取配置列表
    const configurations = db.prepare(
      'SELECT * FROM configurations WHERE strategyId = ? ORDER BY isOptimal DESC, sharpeRatio DESC'
    ).all(req.params.id) as any[];

    const strategy = {
      id: row.id,
      name: row.name,
      description: row.description,
      tags: JSON.parse(row.tags || '[]'),
      author: {
        id: row.authorId,
        walletAddress: row.authorWallet,
        displayName: row.authorName,
        avatar: row.authorAvatar,
      },
      currentVersionId: row.currentVersionId,
      forkFromId: row.forkFromId,
      forkFromVersionId: row.forkFromVersionId,
      isPublic: !!row.isPublic,
      robustnessScore: row.robustnessScore,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // 当前版本
      currentVersion: currentVersion ? {
        id: currentVersion.id,
        version: currentVersion.version,
        code: currentVersion.code,
        paramSchema: currentVersion.paramSchema ? JSON.parse(currentVersion.paramSchema) : null,
        changelog: currentVersion.changelog,
        createdAt: currentVersion.createdAt,
      } : null,
      // 向后兼容的 code / config 字段
      code: currentVersion?.code || '',
      config: configurations.length > 0 ? JSON.parse(configurations[0].params || '{}') : {},
      version: currentVersion?.version || 'v1',
      // 版本列表
      versions: versions.map(v => ({
        ...v,
        paramSchema: v.paramSchema ? JSON.parse(v.paramSchema) : null,
      })),
      // 配置列表
      configurations: configurations.map(c => ({
        ...c,
        params: JSON.parse(c.params || '{}'),
        equityCurve: c.equityCurve ? JSON.parse(c.equityCurve) : [],
        isPublished: !!c.isPublished,
        isOptimal: !!c.isOptimal,
      })),
    };

    res.json(strategy);
  } catch (err: any) {
    console.error('GET /api/strategies/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/strategies — 创建策略（需登录）─────────────────────
router.post('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { name, description, code, config, tags, symbol, timeframe } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'name and code are required' });
    }

    const strategyId = uuidv4();
    const versionId = uuidv4();
    const userId = req.user!.id;

    // 创建策略
    db.prepare(`
      INSERT INTO strategies (id, authorId, name, description, tags, currentVersionId)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(strategyId, userId, name, description || '', JSON.stringify(tags || []), versionId);

    // 创建 v1 版本
    db.prepare(`
      INSERT INTO strategy_versions (id, strategyId, version, code, changelog)
      VALUES (?, ?, ?, ?, ?)
    `).run(versionId, strategyId, 'v1', code, 'Initial version');

    // 如果提供了配置参数，创建一个默认配置
    if (symbol || config) {
      const configId = uuidv4();
      db.prepare(`
        INSERT INTO configurations (id, versionId, strategyId, symbol, timeframe, params, isOptimal)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(configId, versionId, strategyId, symbol || 'WOKB/USDT', timeframe || '1h', JSON.stringify(config || {}));
    }

    // 返回创建的策略
    const created = db.prepare(`
      SELECT s.*, u.walletAddress as authorWallet, u.displayName as authorName
      FROM strategies s LEFT JOIN users u ON u.id = s.authorId
      WHERE s.id = ?
    `).get(strategyId) as any;

    res.status(201).json({
      id: created.id,
      name: created.name,
      description: created.description,
      tags: JSON.parse(created.tags || '[]'),
      author: { id: userId, walletAddress: created.authorWallet, displayName: created.authorName },
      currentVersionId: versionId,
      code,
      version: 'v1',
      config: config || {},
      createdAt: created.createdAt,
    });
  } catch (err: any) {
    console.error('POST /api/strategies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/strategies/:id — 更新策略元信息 ─────────────────────
router.put('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id) as any;
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }
    if (strategy.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Only the author can update this strategy' });
    }

    const { name, description, tags, status, isPublic } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (isPublic !== undefined) { updates.push('isPublic = ?'); params.push(isPublic ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updatedAt = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE strategies SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id) as any;
    res.json({
      ...updated,
      tags: JSON.parse(updated.tags || '[]'),
      isPublic: !!updated.isPublic,
    });
  } catch (err: any) {
    console.error('PUT /api/strategies/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/strategies/:id/versions — 创建新版本 ──────────────
router.post('/:id/versions', requireAuth, (req: Request, res: Response) => {
  try {
    const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id) as any;
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }
    if (strategy.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Only the author can add versions' });
    }

    const { code, changelog, paramSchema } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    // 计算新版本号
    const lastVersion = db.prepare(
      "SELECT version FROM strategy_versions WHERE strategyId = ? ORDER BY createdAt DESC LIMIT 1"
    ).get(req.params.id) as any;

    const versionNum = lastVersion ? parseInt(lastVersion.version.replace('v', '')) + 1 : 1;
    const versionStr = `v${versionNum}`;
    const versionId = uuidv4();

    db.prepare(`
      INSERT INTO strategy_versions (id, strategyId, version, code, paramSchema, changelog)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(versionId, req.params.id, versionStr, code, paramSchema ? JSON.stringify(paramSchema) : null, changelog || '');

    // 更新策略的 currentVersionId
    db.prepare("UPDATE strategies SET currentVersionId = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(versionId, req.params.id);

    res.status(201).json({
      id: versionId,
      strategyId: req.params.id,
      version: versionStr,
      code,
      paramSchema: paramSchema || null,
      changelog: changelog || '',
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('POST /api/strategies/:id/versions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/strategies/:id/configurations — 添加配置（回测结果）─
router.post('/:id/configurations', requireAuth, (req: Request, res: Response) => {
  try {
    const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id) as any;
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const {
      versionId, symbol, timeframe, params: configParams,
      totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve,
      inSampleSharpe, outSampleSharpe, paramSensitivity,
    } = req.body;

    if (!symbol || !timeframe) {
      return res.status(400).json({ error: 'symbol and timeframe are required' });
    }

    // 使用提供的 versionId 或策略当前版本
    const effectiveVersionId = versionId || strategy.currentVersionId;
    if (!effectiveVersionId) {
      return res.status(400).json({ error: 'No version available for this strategy' });
    }

    const configId = uuidv4();

    db.prepare(`
      INSERT INTO configurations (
        id, versionId, strategyId, symbol, timeframe, params,
        totalReturn, maxDrawdown, sharpeRatio, winRate, totalTrades, equityCurve,
        inSampleSharpe, outSampleSharpe, paramSensitivity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      configId, effectiveVersionId, req.params.id, symbol, timeframe,
      JSON.stringify(configParams || {}),
      totalReturn ?? null, maxDrawdown ?? null, sharpeRatio ?? null,
      winRate ?? null, totalTrades ?? null,
      equityCurve ? JSON.stringify(equityCurve) : null,
      inSampleSharpe ?? null, outSampleSharpe ?? null, paramSensitivity ?? null,
    );

    const created = db.prepare('SELECT * FROM configurations WHERE id = ?').get(configId) as any;
    res.status(201).json({
      ...created,
      params: JSON.parse(created.params || '{}'),
      equityCurve: created.equityCurve ? JSON.parse(created.equityCurve) : [],
      isPublished: !!created.isPublished,
      isOptimal: !!created.isOptimal,
    });
  } catch (err: any) {
    console.error('POST /api/strategies/:id/configurations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/strategies/:id/fork — Fork 策略 ──────────────────
router.post('/:id/fork', requireAuth, (req: Request, res: Response) => {
  try {
    const original = db.prepare(`
      SELECT s.*, sv.code as currentCode
      FROM strategies s
      LEFT JOIN strategy_versions sv ON sv.id = s.currentVersionId
      WHERE s.id = ?
    `).get(req.params.id) as any;

    if (!original) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const { name, description, code, tags } = req.body;

    // Fork 必须修改代码
    if (!code) {
      return res.status(400).json({ error: 'code is required — Fork must include code changes' });
    }

    if (original.currentCode && code.trim() === original.currentCode.trim()) {
      return res.status(400).json({ error: 'Fork must include code changes (code is identical to original)' });
    }

    const newStrategyId = uuidv4();
    const newVersionId = uuidv4();
    const userId = req.user!.id;

    // 创建 fork 策略
    db.prepare(`
      INSERT INTO strategies (id, authorId, name, description, tags, currentVersionId, forkFromId, forkFromVersionId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newStrategyId, userId,
      name || `${original.name} (Fork)`,
      description || original.description,
      JSON.stringify(tags || JSON.parse(original.tags || '[]')),
      newVersionId,
      original.id,
      original.currentVersionId,
    );

    // 创建 v1 版本
    db.prepare(`
      INSERT INTO strategy_versions (id, strategyId, version, code, changelog)
      VALUES (?, ?, ?, ?, ?)
    `).run(newVersionId, newStrategyId, 'v1', code, `Forked from ${original.name}`);

    res.status(201).json({
      id: newStrategyId,
      name: name || `${original.name} (Fork)`,
      forkFromId: original.id,
      currentVersionId: newVersionId,
      code,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('POST /api/strategies/:id/fork error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/strategies/:id/publish — 发布配置为信号 ──────────
router.post('/:id/publish', requireAuth, (req: Request, res: Response) => {
  try {
    const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id) as any;
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }
    if (strategy.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Only the author can publish' });
    }

    const { configurationId } = req.body;
    if (!configurationId) {
      return res.status(400).json({ error: 'configurationId is required' });
    }

    const config = db.prepare('SELECT * FROM configurations WHERE id = ? AND strategyId = ?')
      .get(configurationId, req.params.id) as any;
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found for this strategy' });
    }

    // 取消其他已发布配置
    db.prepare('UPDATE configurations SET isPublished = 0 WHERE strategyId = ?').run(req.params.id);

    // 发布选中的配置
    db.prepare('UPDATE configurations SET isPublished = 1, isOptimal = 1 WHERE id = ?').run(configurationId);

    res.json({ message: 'Configuration published as signal', configurationId });
  } catch (err: any) {
    console.error('POST /api/strategies/:id/publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/strategies/:id/backtest — 获取回测数据（向后兼容）──
router.get('/:id/backtest', (req: Request, res: Response) => {
  try {
    const strategy = db.prepare('SELECT id FROM strategies WHERE id = ?').get(req.params.id);
    if (!strategy) {
      // 也检查 legacy 表
      const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='strategies_legacy'").get();
      if (legacy) {
        const legacyRow = db.prepare('SELECT id FROM strategies_legacy WHERE id = ?').get(req.params.id);
        if (legacyRow) {
          const rows = db.prepare('SELECT * FROM backtests WHERE strategyId = ? ORDER BY createdAt DESC').all(req.params.id) as any[];
          return res.json(rows.map(r => ({ ...r, equityCurve: JSON.parse(r.equityCurve || '[]') })));
        }
      }
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const rows = db.prepare('SELECT * FROM backtests WHERE strategyId = ? ORDER BY createdAt DESC').all(req.params.id) as any[];
    res.json(rows.map(r => ({ ...r, equityCurve: JSON.parse(r.equityCurve || '[]') })));
  } catch (err: any) {
    console.error('GET /api/strategies/:id/backtest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/strategies/:id/forks — 该策略的所有 Fork ──────────
router.get('/:id/forks', (req: Request, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT s.*, u.displayName as authorName, u.walletAddress as authorWallet
      FROM strategies s
      LEFT JOIN users u ON u.id = s.authorId
      WHERE s.forkFromId = ?
      ORDER BY s.createdAt DESC
    `).all(req.params.id) as any[];

    res.json(rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      author: { id: row.authorId, displayName: row.authorName, walletAddress: row.authorWallet },
      tags: JSON.parse(row.tags || '[]'),
      createdAt: row.createdAt,
    })));
  } catch (err: any) {
    console.error('GET /api/strategies/:id/forks error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
