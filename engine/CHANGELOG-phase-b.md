# Phase B: 策略优化器 — CHANGELOG

**日期**: 2026-04-02  
**状态**: ✅ 完成

---

## 新增模块

### 1. `param_extractor.py` — 参数提取模块
- `extract_params(code: str) -> dict`
- 从 Strategy 子类中自动识别数值类型的类变量
- 排除方法、内置属性、私有属性
- 返回 `{ "param_name": {"type": "int"|"float", "default": value} }`

### 2. `optimizer.py` — 优化器模块
- `run_optimization(code, data, param_ranges, optimize_target, in_sample_ratio, cash, commission) -> dict`
- 利用 backtesting.py 内置 `Backtest.optimize()` 做网格搜索
- 样本内/外切分（默认 70/30）
- 优化目标映射: sharpe / return / drawdown / winrate
- 参数敏感度: 最优参数 ±1 step 的 Sharpe 标准差
- 过拟合检测: outSampleSharpe / inSampleSharpe < 0.5 → warning
- 超时保护: 300 秒
- 参数空间限制: > 50,000 组合拒绝

### 3. `scanner.py` — 批量扫描模块
- `run_scan(code, symbols, timeframes, param_ranges, ...) -> dict`
- 跨标的 × 时间框架批量优化
- 结果按优化目标排序
- 稳健度评分 = 平均 outSample Sharpe / 最优 outSample Sharpe × 100
- 支持 progress_callback 回调（用于 SSE 推送）
- 超时保护: 600 秒

## 修改文件

### `data_fetcher.py` — XLayer 标的映射
- 新增 `XLAYER_SYMBOL_MAP`: WOKB→OKB, XETH→ETH, XBTC→BTC, XSOL→SOL
- 扩展 `SUPPORTED_SYMBOLS` 包含 4 个 XLayer 标的
- `fetch_ohlcv()` 内部自动映射: 用户传 `WOKB/USDT` → 引擎用 `OKB/USDT` 从 OKX 拉数据

### `main.py` — 新增 3 个 API 端点
- `POST /engine/extract-params` — 参数提取
- `POST /engine/optimize` — 单标的优化
- `POST /engine/scan` — 多标的批量扫描
- 新增对应的 Pydantic 请求模型
- 所有现有端点保持不变

## 测试结果

| 测试项 | 状态 |
|--------|------|
| extract_params 提取 sma_fast/sma_slow | ✅ |
| _count_combinations 计算参数空间 | ✅ |
| _build_ranges 转换为 range() | ✅ |
| run_optimization 端到端优化 | ✅ |
| XLayer 标的映射 | ✅ |
| 现有 validate_strategy 不受影响 | ✅ |
| 现有 load_strategy_class 不受影响 | ✅ |
| 所有 12 个路由正确注册 | ✅ |

## 技术细节
- Python 3.11+
- 依赖: backtesting.py, pandas, numpy, ta, ccxt
- 未删除任何现有文件
- 所有新代码含超时保护和错误处理
