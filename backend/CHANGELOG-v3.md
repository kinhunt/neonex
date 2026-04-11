# CHANGELOG v3 — Phase A: 基础重构

**Date:** 2026-04-02
**Author:** 黑松鼠 🐿️

---

## 完成的工作

### 1. 数据库 Schema 迁移
- 新增 `users` 表（钱包地址、OAuth 预留、显示名称、头像）
- 重构 `strategies` 表（authorId 外键、版本引用、fork 链、稳健度评分）
- 新增 `strategy_versions` 表（代码版本管理、参数 schema、变更日志）
- 新增 `configurations` 表（标的 + 时间框架 + 参数 + 回测结果 + 样本内外验证）
- 新增 `optimization_tasks` 表（优化任务状态管理，Phase B 用）
- 新增 `notifications` 表（站内通知，Phase C 用）
- 新增 `auth_nonces` 表（SIWE 防重放）
- 旧 `strategies` 表自动重命名为 `strategies_legacy`，保留向后兼容
- 旧 `backtests` 表保留，回测结果同时写入新旧两个表

### 2. 钱包登录 API (SIWE + JWT)
- `POST /api/auth/challenge` — 生成 EIP-4361 SIWE message + nonce（10 分钟过期）
- `POST /api/auth/verify` — 验证签名 + 创建/查找用户 + 返回 JWT（7 天有效）
- `GET /api/auth/me` — 获取当前用户信息（需 Bearer token）
- `PUT /api/auth/profile` — 更新显示名称/头像（需 Bearer token）
- JWT 中间件：`requireAuth`（强制）+ `optionalAuth`（可选）
- EIP-55 地址自动 checksum 修正

### 3. 策略/版本/配置 CRUD
- `POST /api/strategies` — 创建策略 + v1 版本（需登录）
- `GET /api/strategies` — 策略列表（公开、分页、搜索、标的筛选、排序）
- `GET /api/strategies/:id` — 策略详情（含版本列表 + 配置列表 + 当前代码）
- `PUT /api/strategies/:id` — 更新策略元信息（需作者身份）
- `POST /api/strategies/:id/versions` — 创建新版本（自动递增 v1→v2→v3）
- `POST /api/strategies/:id/configurations` — 添加配置/回测结果
- `POST /api/strategies/:id/fork` — Fork 策略（强制 code diff 检查）
- `POST /api/strategies/:id/publish` — 发布配置为信号
- `GET /api/strategies/:id/forks` — 获取策略的所有 fork
- `GET /api/strategies/:id/backtest` — 获取回测数据（向后兼容）

### 4. Auto-seed 迁移
- 创建 system 用户 (SquirrelQuant)
- 3 个 demo 策略，每个策略包含：
  - 1 个 strategy_version (v1)
  - 2-3 个 configurations（不同标的 + 时间框架 + 回测结果）
  - 1 条 backtests 记录（向后兼容）
- 自动生成模拟收益曲线

### 5. XLayer 标的配置
- 支持 4 个活跃交易对：WOKB/USDT, XETH/USDT, XBTC/USDT, XSOL/USDT
- TITAN/USDT 标记为暂不可用（无 CEX 数据源）
- ccxt 自动映射（WOKB→OKB, XETH→ETH, XBTC→BTC, XSOL→SOL）
- `GET /api/symbols` — 返回标的列表 + 时间框架
- `GET /api/symbols/map/:symbol` — 标的映射查询
- 回测代理自动映射 XLayer symbol → ccxt symbol
- 包含代币合约地址

---

## 新增依赖
- `siwe` — Sign-In with Ethereum
- `ethers@5` — 以太坊工具（地址 checksum 等）
- `jsonwebtoken` — JWT 生成/验证
- `@types/jsonwebtoken` — 类型定义

## 文件结构
```
backend/src/
├── index.ts              — 主入口（v3 更新）
├── db.ts                 — 数据库初始化 + 迁移（v3 重构）
├── auto-seed.ts          — 种子数据（v3 新模型）
├── symbols.ts            — XLayer 标的配置（新增）
├── middleware/
│   └── auth.ts           — JWT 鉴权中间件（新增）
└── routes/
    ├── auth.ts           — 钱包登录路由（新增）
    ├── strategies.ts     — 策略 CRUD（v3 重构）
    ├── backtest.ts       — 回测代理（v3 更新：标的映射）
    ├── symbols.ts        — 标的路由（新增）
    └── ai.ts             — AI 路由（保留不变）
```

## API 端点清单

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/auth/challenge | ❌ | 获取 SIWE challenge |
| POST | /api/auth/verify | ❌ | 验证签名登录 |
| GET | /api/auth/me | ✅ | 获取当前用户 |
| PUT | /api/auth/profile | ✅ | 更新个人资料 |
| GET | /api/strategies | ❌ | 策略列表 |
| GET | /api/strategies/:id | ❌ | 策略详情 |
| POST | /api/strategies | ✅ | 创建策略 |
| PUT | /api/strategies/:id | ✅ | 更新策略 |
| POST | /api/strategies/:id/versions | ✅ | 新建版本 |
| POST | /api/strategies/:id/configurations | ✅ | 添加配置 |
| POST | /api/strategies/:id/fork | ✅ | Fork 策略 |
| POST | /api/strategies/:id/publish | ✅ | 发布配置 |
| GET | /api/strategies/:id/forks | ❌ | 获取 forks |
| GET | /api/strategies/:id/backtest | ❌ | 获取回测 |
| POST | /api/strategies/:id/backtest/run | ❌ | 运行回测 |
| GET | /api/symbols | ❌ | 标的列表 |
| GET | /api/symbols/map/:symbol | ❌ | 标的映射 |
| POST | /api/ai/generate-strategy | ❌ | AI 生成策略 |
| POST | /api/ai/improve-strategy | ❌ | AI 改进策略 |
| POST | /api/ai/explain-strategy | ❌ | AI 解释策略 |
| GET | /health | ❌ | 健康检查 |

## 下一步 (Phase B)
1. 引擎：参数提取端点 (`POST /engine/extract-params`)
2. 引擎：批量优化端点 + 样本内/外切分
3. 后端：优化任务管理 API
4. 后端：SSE 进度推送
