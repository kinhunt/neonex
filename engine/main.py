"""
FastAPI 主服务 - 策略引擎 API
"""
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from data_fetcher import fetch_ohlcv, get_latest_data, SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES
from backtester import run_backtest, run_signal, validate_strategy
from param_extractor import extract_params
from optimizer import run_optimization, _count_combinations, MAX_COMBINATIONS
from scanner import run_scan

app = FastAPI(
    title="Neonex Strategy Engine",
    description="Python 策略回测引擎 - Layer 1 Strategy Market",
    version="0.1.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ENGINE_PORT = int(os.getenv("PORT", os.getenv("ENGINE_PORT", "3200")))


# ========== Request / Response Models ==========

class BacktestRequest(BaseModel):
    code: str
    config: Optional[Dict[str, Any]] = None
    symbol: str = "ETH/USDT"
    timeframe: str = "1h"
    period: str = "6M"
    cash: float = 10000
    commission: float = 0.001


class SignalRequest(BaseModel):
    code: str
    config: Optional[Dict[str, Any]] = None
    symbol: str = "ETH/USDT"
    timeframe: str = "1h"


class ValidateRequest(BaseModel):
    code: str


class ExtractParamsRequest(BaseModel):
    code: str


class OptimizeRequest(BaseModel):
    code: str
    symbol: str = "ETH/USDT"
    timeframe: str = "1h"
    paramRanges: Dict[str, Dict[str, Any]]
    optimizeTarget: str = "sharpe"
    inSampleRatio: float = 0.7
    cash: float = 10000
    commission: float = 0.001
    period: str = "6M"
    weights: Optional[Dict[str, float]] = None


class ScanRequest(BaseModel):
    code: str
    symbols: List[str] = ["WOKB/USDT", "XETH/USDT"]
    timeframes: List[str] = ["1h", "4h"]
    paramRanges: Dict[str, Dict[str, Any]]
    optimizeTarget: str = "sharpe"
    inSampleRatio: float = 0.7
    period: str = "6M"
    cash: float = 10000
    commission: float = 0.001
    weights: Optional[Dict[str, float]] = None


# ========== 端点 ==========

@app.get("/engine/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "service": "strategy-engine",
        "version": "0.1.0",
        "supportedSymbols": SUPPORTED_SYMBOLS,
        "supportedTimeframes": SUPPORTED_TIMEFRAMES,
    }


@app.post("/engine/backtest")
async def backtest_endpoint(req: BacktestRequest):
    """
    运行回测。

    接收策略代码、配置参数、交易对、时间周期，
    返回回测结果（收益率、最大回撤、夏普率等）。
    """
    # 验证参数
    if req.symbol not in SUPPORTED_SYMBOLS:
        raise HTTPException(400, f"不支持的交易对: {req.symbol}，支持: {SUPPORTED_SYMBOLS}")
    if req.timeframe not in SUPPORTED_TIMEFRAMES:
        raise HTTPException(400, f"不支持的时间周期: {req.timeframe}，支持: {SUPPORTED_TIMEFRAMES}")

    try:
        # 拉取数据
        data = fetch_ohlcv(
            symbol=req.symbol,
            timeframe=req.timeframe,
            period=req.period,
        )

        if data.empty or len(data) < 20:
            raise HTTPException(400, f"数据不足，仅获取到 {len(data)} 根 K 线")

        # 运行回测
        result = run_backtest(
            code=req.code,
            data=data,
            cash=req.cash,
            commission=req.commission,
            config=req.config,
        )

        if "error" in result:
            raise HTTPException(400, result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"回测执行错误: {str(e)}")


@app.post("/engine/run-signal")
async def signal_endpoint(req: SignalRequest):
    """
    运行策略获取最新信号。

    分析最新市场数据，返回策略给出的当前操作建议。
    """
    if req.symbol not in SUPPORTED_SYMBOLS:
        raise HTTPException(400, f"不支持的交易对: {req.symbol}")

    try:
        data = get_latest_data(
            symbol=req.symbol,
            timeframe=req.timeframe,
            limit=200,
        )

        if data.empty:
            raise HTTPException(400, "无法获取市场数据")

        result = run_signal(
            code=req.code,
            data=data,
            config=req.config,
        )

        # 补充市场信息
        result["market"] = {
            "symbol": req.symbol,
            "timeframe": req.timeframe,
            "lastPrice": round(float(data["Close"].iloc[-1]), 2),
            "dataPoints": len(data),
        }

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"信号生成错误: {str(e)}")


@app.get("/engine/indicators")
async def indicators_endpoint():
    """
    返回可用的技术指标列表。

    使用 ta 库提供 130+ 技术指标。
    """
    try:
        indicators = _get_available_indicators()
        return {
            "count": len(indicators),
            "indicators": indicators,
        }
    except Exception as e:
        raise HTTPException(500, f"获取指标列表失败: {str(e)}")


@app.post("/engine/validate")
async def validate_endpoint(req: ValidateRequest):
    """
    验证策略代码语法和结构。

    检查代码是否可编译、是否包含 Strategy 子类、是否有 init/next 方法。
    """
    result = validate_strategy(req.code)
    return result


# ========== Phase B: 策略优化器端点 ==========

@app.post("/engine/extract-params")
async def extract_params_endpoint(req: ExtractParamsRequest):
    """
    从策略代码中提取可调参数。

    自动识别 Strategy 子类中的数值类变量。
    """
    try:
        params = extract_params(req.code)
        return {"params": params}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"参数提取失败: {str(e)}")


@app.post("/engine/optimize")
async def optimize_endpoint(req: OptimizeRequest):
    """
    单标的参数优化。

    对指定交易对和时间框架进行参数网格搜索，
    返回样本内/外表现、参数敏感度、过拟合警告。
    """
    if req.symbol not in SUPPORTED_SYMBOLS:
        raise HTTPException(400, f"不支持的交易对: {req.symbol}，支持: {SUPPORTED_SYMBOLS}")
    if req.timeframe not in SUPPORTED_TIMEFRAMES:
        raise HTTPException(400, f"不支持的时间周期: {req.timeframe}，支持: {SUPPORTED_TIMEFRAMES}")

    # 检查参数空间大小
    total = _count_combinations(req.paramRanges)
    if total > MAX_COMBINATIONS:
        raise HTTPException(400, f"参数空间太大 ({total} > {MAX_COMBINATIONS})，请缩小范围或增大 step")

    try:
        data = fetch_ohlcv(
            symbol=req.symbol,
            timeframe=req.timeframe,
            period=req.period,
        )

        if data.empty or len(data) < 40:
            raise HTTPException(400, f"数据不足 ({len(data)} 根K线)，至少需要 40 根")

        result = run_optimization(
            code=req.code,
            data=data,
            param_ranges=req.paramRanges,
            optimize_target=req.optimizeTarget,
            in_sample_ratio=req.inSampleRatio,
            cash=req.cash,
            commission=req.commission,
            weights=req.weights,
        )

        if "error" in result:
            raise HTTPException(400, result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"优化执行错误: {str(e)}")


@app.post("/engine/scan")
async def scan_endpoint(req: ScanRequest):
    """
    多标的批量扫描。

    对多个交易对 × 时间框架组合批量运行优化，
    返回排行榜和稳健度评分。
    """
    # 验证标的
    for s in req.symbols:
        if s not in SUPPORTED_SYMBOLS:
            raise HTTPException(400, f"不支持的交易对: {s}，支持: {SUPPORTED_SYMBOLS}")
    for tf in req.timeframes:
        if tf not in SUPPORTED_TIMEFRAMES:
            raise HTTPException(400, f"不支持的时间周期: {tf}，支持: {SUPPORTED_TIMEFRAMES}")

    # 检查参数空间
    total = _count_combinations(req.paramRanges)
    if total > MAX_COMBINATIONS:
        raise HTTPException(400, f"参数空间太大 ({total} > {MAX_COMBINATIONS})，请缩小范围或增大 step")

    try:
        result = run_scan(
            code=req.code,
            symbols=req.symbols,
            timeframes=req.timeframes,
            param_ranges=req.paramRanges,
            optimize_target=req.optimizeTarget,
            in_sample_ratio=req.inSampleRatio,
            period=req.period,
            cash=req.cash,
            commission=req.commission,
            weights=req.weights,
        )

        if "error" in result:
            raise HTTPException(400, result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"扫描执行错误: {str(e)}")


# ========== 辅助函数 ==========

def _get_available_indicators() -> list:
    """获取 ta 库所有可用指标"""
    try:
        import ta
        import inspect

        indicators = []

        # 从各个子模块收集指标
        modules = {
            "momentum": ta.momentum,
            "trend": ta.trend,
            "volatility": ta.volatility,
            "volume": ta.volume,
            "others": getattr(ta, "others", None),
        }

        for category, mod in modules.items():
            if mod is None:
                continue
            for name, obj in inspect.getmembers(mod):
                if inspect.isclass(obj) and not name.startswith("_"):
                    doc = obj.__doc__ or ""
                    first_line = doc.strip().split("\n")[0] if doc.strip() else ""
                    indicators.append({
                        "name": name,
                        "category": category,
                        "description": first_line,
                    })

        # 去重
        seen = set()
        unique = []
        for ind in indicators:
            if ind["name"] not in seen:
                seen.add(ind["name"])
                unique.append(ind)

        return sorted(unique, key=lambda x: (x["category"], x["name"]))

    except Exception as e:
        return [{"name": "error", "category": "error", "description": str(e)}]


# ========== 启动 ==========

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=ENGINE_PORT)
