"""
Bollinger Breakout (布林带突破策略)

波动率突破策略：
- 价格突破上轨 → 买入（强势突破）
- 价格跌破下轨 → 卖出（弱势突破）
- 价格回到中轨 → 平仓

可调参数：bb_period, bb_std
"""

from backtesting import Strategy
from backtesting.lib import crossover
import numpy as np


def BB_UPPER(values, n=20, std=2.0):
    """布林带上轨"""
    result = np.full_like(values, np.nan, dtype=float)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1:i + 1]
        ma = np.mean(window)
        sd = np.std(window, ddof=1)
        result[i] = ma + std * sd
    return result


def BB_LOWER(values, n=20, std=2.0):
    """布林带下轨"""
    result = np.full_like(values, np.nan, dtype=float)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1:i + 1]
        ma = np.mean(window)
        sd = np.std(window, ddof=1)
        result[i] = ma - std * sd
    return result


def BB_MID(values, n=20):
    """布林带中轨（SMA）"""
    result = np.full_like(values, np.nan, dtype=float)
    for i in range(n - 1, len(values)):
        result[i] = np.mean(values[i - n + 1:i + 1])
    return result


class BollingerBreakout(Strategy):
    bb_period = 20
    bb_std = 2.0

    def init(self):
        close = self.data.Close
        self.upper = self.I(BB_UPPER, close, self.bb_period, self.bb_std)
        self.lower = self.I(BB_LOWER, close, self.bb_period, self.bb_std)
        self.mid = self.I(BB_MID, close, self.bb_period)

    def next(self):
        price = self.data.Close[-1]

        if not self.position:
            # 突破上轨 → 买入
            if price > self.upper[-1]:
                self.buy()
        else:
            # 回到中轨 → 平仓
            if price < self.mid[-1]:
                self.sell()


STRATEGY_CODE = '''
from backtesting import Strategy
import numpy as np


def BB_UPPER(values, n=20, std=2.0):
    """布林带上轨"""
    result = np.full_like(values, np.nan, dtype=float)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1:i + 1]
        ma = np.mean(window)
        sd = np.std(window, ddof=1)
        result[i] = ma + std * sd
    return result


def BB_LOWER(values, n=20, std=2.0):
    """布林带下轨"""
    result = np.full_like(values, np.nan, dtype=float)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1:i + 1]
        ma = np.mean(window)
        sd = np.std(window, ddof=1)
        result[i] = ma - std * sd
    return result


def BB_MID(values, n=20):
    """布林带中轨（SMA）"""
    result = np.full_like(values, np.nan, dtype=float)
    for i in range(n - 1, len(values)):
        result[i] = np.mean(values[i - n + 1:i + 1])
    return result


class BollingerBreakout(Strategy):
    bb_period = 20
    bb_std = 2.0

    def init(self):
        close = self.data.Close
        self.upper = self.I(BB_UPPER, close, self.bb_period, self.bb_std)
        self.lower = self.I(BB_LOWER, close, self.bb_period, self.bb_std)
        self.mid = self.I(BB_MID, close, self.bb_period)

    def next(self):
        price = self.data.Close[-1]

        if not self.position:
            if price > self.upper[-1]:
                self.buy()
        else:
            if price < self.mid[-1]:
                self.sell()
'''

STRATEGY_META = {
    "name": "Bollinger Breakout",
    "description": "布林带突破策略 — 价格突破上轨时买入，回到中轨时平仓。适合波动率扩张行情。",
    "tags": ["volatility", "breakout", "bollinger"],
    "params": {
        "bb_period": {"type": "int", "default": 20, "min": 5, "max": 100, "description": "布林带周期"},
        "bb_std": {"type": "float", "default": 2.0, "min": 0.5, "max": 4.0, "description": "标准差倍数"},
    },
}
