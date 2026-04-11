"""
回测模块 - 接收策略代码，动态加载执行，返回回测结果
"""
import signal
import math
import traceback
import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from io import StringIO
import sys
import json

BACKTEST_TIMEOUT = 60  # 秒


class TimeoutError(Exception):
    pass


def _timeout_handler(signum, frame):
    raise TimeoutError("策略执行超时（>60s）")


def _safe_float(v, default=0.0):
    """安全转换 float，处理 NaN/Inf"""
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


def load_strategy_class(code: str) -> type:
    """
    从代码字符串中动态加载 Strategy 子类。
    代码中必须定义一个继承 backtesting.Strategy 的类。
    """
    exec_globals = {
        "__builtins__": __builtins__,
        "Strategy": Strategy,
        "crossover": crossover,
        "pd": pd,
        "np": np,
    }

    try:
        import ta
        exec_globals["ta"] = ta
    except ImportError:
        pass

    try:
        import ta as _ta
        exec_globals["pandas_ta"] = _ta
    except ImportError:
        pass

    exec(code, exec_globals)

    strategy_class = None
    for name, obj in exec_globals.items():
        if (
            isinstance(obj, type)
            and issubclass(obj, Strategy)
            and obj is not Strategy
        ):
            strategy_class = obj
            break

    if strategy_class is None:
        raise ValueError("策略代码中未找到 Strategy 子类")

    return strategy_class


def run_backtest(
    code: str,
    data: pd.DataFrame,
    cash: float = 10000,
    commission: float = 0.001,
    config: dict = None,
) -> dict:
    """
    运行回测。
    """
    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(BACKTEST_TIMEOUT)

    try:
        strategy_class = load_strategy_class(code)

        if config:
            for key, value in config.items():
                if hasattr(strategy_class, key):
                    setattr(strategy_class, key, value)

        required_cols = ["Open", "High", "Low", "Close", "Volume"]
        for col in required_cols:
            if col not in data.columns:
                raise ValueError(f"数据缺少列: {col}")

        # 自动调整 cash：确保至少能买 1 单位最高价资产
        max_price = float(data["Close"].max())
        if cash < max_price * 1.5:
            cash = max_price * 10  # 给够资金

        import warnings
        warnings.filterwarnings("ignore")

        old_stdout = sys.stdout
        sys.stdout = StringIO()

        try:
            bt = Backtest(
                data,
                strategy_class,
                cash=cash,
                commission=commission,
                exclusive_orders=True,
            )
            stats = bt.run()
        finally:
            sys.stdout = old_stdout

        equity_curve = stats["_equity_curve"]
        trades_df = stats["_trades"]

        # 构建 equity curve 列表
        equity_list = []
        for ts, row in equity_curve.iterrows():
            equity_list.append(
                {
                    "date": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                    "equity": round(_safe_float(row["Equity"]), 2),
                }
            )

        # 构建 trades 列表
        trades_list = []
        for _, t in trades_df.iterrows():
            trade = {
                "entryTime": str(t.get("EntryTime", "")),
                "exitTime": str(t.get("ExitTime", "")),
                "entryPrice": round(_safe_float(t.get("EntryPrice", 0)), 2),
                "exitPrice": round(_safe_float(t.get("ExitPrice", 0)), 2),
                "pnl": round(_safe_float(t.get("PnL", 0)), 2),
                "returnPct": round(_safe_float(t.get("ReturnPct", 0)) * 100, 2),
                "size": int(_safe_float(t.get("Size", 0))),
            }
            trades_list.append(trade)

        total_return = _safe_float(stats.get("Return [%]", 0))
        max_drawdown = _safe_float(stats.get("Max. Drawdown [%]", 0))
        sharpe_ratio = _safe_float(stats.get("Sharpe Ratio", None))
        win_rate = _safe_float(stats.get("Win Rate [%]", 0))
        total_trades = int(_safe_float(stats.get("# Trades", 0)))

        return {
            "totalReturn": round(total_return, 2),
            "maxDrawdown": round(max_drawdown, 2),
            "sharpeRatio": round(sharpe_ratio, 2),
            "winRate": round(win_rate, 2),
            "totalTrades": total_trades,
            "equityCurve": equity_list,
            "trades": trades_list,
            "startDate": str(data.index[0]) if len(data) > 0 else "",
            "endDate": str(data.index[-1]) if len(data) > 0 else "",
            "initialCash": round(cash, 2),
        }

    except TimeoutError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"回测失败: {str(e)}", "traceback": traceback.format_exc()}
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


def run_signal(code: str, data: pd.DataFrame, config: dict = None) -> dict:
    """
    运行策略获取最新信号。
    """
    try:
        strategy_class = load_strategy_class(code)

        if config:
            for key, value in config.items():
                if hasattr(strategy_class, key):
                    setattr(strategy_class, key, value)

        max_price = float(data["Close"].max())
        cash = max(10000, max_price * 10)

        import warnings
        warnings.filterwarnings("ignore")

        bt = Backtest(
            data,
            strategy_class,
            cash=cash,
            commission=0.001,
            exclusive_orders=True,
        )

        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            stats = bt.run()
        finally:
            sys.stdout = old_stdout

        trades_df = stats["_trades"]

        if trades_df.empty:
            return {
                "signal": {
                    "action": "HOLD",
                    "confidence": 0.0,
                    "reasoning": "策略在当前数据上无交易信号",
                }
            }

        last_trade = trades_df.iloc[-1]
        last_exit = last_trade.get("ExitTime")

        if pd.isna(last_exit) or str(last_exit) == "NaT":
            action = "BUY" if _safe_float(last_trade.get("Size", 0)) > 0 else "SELL"
            return {
                "signal": {
                    "action": action,
                    "confidence": 0.7,
                    "reasoning": f"策略当前持有{'多' if action == 'BUY' else '空'}头仓位，入场价: {_safe_float(last_trade.get('EntryPrice', 0)):.2f}",
                }
            }

        return {
            "signal": {
                "action": "HOLD",
                "confidence": 0.5,
                "reasoning": f"上一笔交易已平仓 (收益: {_safe_float(last_trade.get('ReturnPct', 0))*100:.2f}%)，等待新信号",
            }
        }

    except Exception as e:
        return {
            "signal": {
                "action": "ERROR",
                "confidence": 0.0,
                "reasoning": f"信号生成失败: {str(e)}",
            }
        }


def validate_strategy(code: str) -> dict:
    """验证策略代码语法和结构"""
    errors = []

    try:
        compile(code, "<strategy>", "exec")
    except SyntaxError as e:
        errors.append(f"语法错误 (行 {e.lineno}): {e.msg}")
        return {"valid": False, "errors": errors}

    try:
        strategy_class = load_strategy_class(code)
    except ValueError as e:
        errors.append(str(e))
        return {"valid": False, "errors": errors}
    except Exception as e:
        errors.append(f"代码执行错误: {str(e)}")
        return {"valid": False, "errors": errors}

    if not hasattr(strategy_class, "init"):
        errors.append("策略缺少 init() 方法")
    if not hasattr(strategy_class, "next"):
        errors.append("策略缺少 next() 方法")

    return {"valid": len(errors) == 0, "errors": errors}
