"""
SMA Cross (双均线交叉策略)

经典趋势跟随策略：
- 快线上穿慢线 → 买入
- 快线下穿慢线 → 卖出

可调参数：fast_period, slow_period
"""

from backtesting import Strategy
from backtesting.lib import crossover
import numpy as np
import pandas as pd


def SMA(values, n):
    """简单移动平均线（返回与输入等长数组，前 n-1 个为 NaN）"""
    return pd.Series(values).rolling(n).mean().values


class SmaCross(Strategy):
    fast_period = 10
    slow_period = 30

    def init(self):
        close = self.data.Close
        self.fast_ma = self.I(SMA, close, self.fast_period)
        self.slow_ma = self.I(SMA, close, self.slow_period)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            self.sell()


# 策略代码字符串（供 API 使用）
STRATEGY_CODE = '''
from backtesting import Strategy
from backtesting.lib import crossover
import numpy as np
import pandas as pd

def SMA(values, n):
    """简单移动平均线"""
    return pd.Series(values).rolling(n).mean().values

class SmaCross(Strategy):
    fast_period = 10
    slow_period = 30

    def init(self):
        close = self.data.Close
        self.fast_ma = self.I(SMA, close, self.fast_period)
        self.slow_ma = self.I(SMA, close, self.slow_period)

    def next(self):
        if crossover(self.fast_ma, self.slow_ma):
            self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            self.sell()
'''

STRATEGY_META = {
    "name": "SMA Cross",
    "description": "双均线交叉策略 — 快线上穿慢线买入，下穿卖出。最经典的趋势跟随策略。",
    "tags": ["trend", "moving-average", "beginner"],
    "params": {
        "fast_period": {"type": "int", "default": 10, "min": 2, "max": 100, "description": "快线周期"},
        "slow_period": {"type": "int", "default": 30, "min": 5, "max": 200, "description": "慢线周期"},
    },
}
