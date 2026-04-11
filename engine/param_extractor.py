"""
参数提取模块 - 从策略代码中自动识别可调参数
"""
from backtesting import Strategy
from backtesting.lib import crossover
import numpy as np
import pandas as pd


# 内置属性 / 方法黑名单
_BUILTIN_ATTRS = {
    "init", "next", "buy", "sell", "position", "data", "equity",
    "orders", "trades", "closed_trades", "I",
    "__module__", "__qualname__", "__doc__", "__dict__", "__weakref__",
}


def extract_params(code: str) -> dict:
    """
    从策略代码中提取可调参数。

    backtesting.py 的 Strategy 子类用类变量定义参数：
        class MyStrategy(Strategy):
            sma_fast = 10    # 可调参数
            sma_slow = 30

    返回格式:
        {
            "sma_fast": {"type": "int", "default": 10},
            "sma_slow": {"type": "int", "default": 30}
        }
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

    exec(code, exec_globals)

    # 找到 Strategy 子类
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

    params = {}

    # 遍历类自身定义的属性（不含继承来的）
    for attr_name, attr_value in vars(strategy_class).items():
        # 跳过私有/内置/方法
        if attr_name.startswith("_"):
            continue
        if attr_name in _BUILTIN_ATTRS:
            continue
        if callable(attr_value):
            continue

        # 只提取数值类型
        if isinstance(attr_value, (int, float)):
            param_type = "int" if isinstance(attr_value, int) else "float"
            params[attr_name] = {
                "type": param_type,
                "default": attr_value,
            }

    return params
