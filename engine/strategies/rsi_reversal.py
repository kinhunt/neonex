"""
RSI Mean Reversion (RSI 超买超卖反转策略)

均值回归策略：
- RSI 低于 oversold → 买入（超卖反弹）
- RSI 高于 overbought → 卖出（超买回调）

可调参数：rsi_period, overbought, oversold
"""

from backtesting import Strategy
from backtesting.lib import crossover
import numpy as np


def RSI(values, n=14):
    """计算 RSI 指标"""
    deltas = np.diff(values)
    seed = deltas[:n]
    up = seed[seed >= 0].sum() / n
    down = -seed[seed < 0].sum() / n
    if down == 0:
        rs = 100.0
    else:
        rs = up / down
    rsi = np.zeros_like(values, dtype=float)
    rsi[:n] = 100. - 100. / (1. + rs)

    for i in range(n, len(values)):
        delta = deltas[i - 1]
        if delta > 0:
            upval = delta
            downval = 0.
        else:
            upval = 0.
            downval = -delta

        up = (up * (n - 1) + upval) / n
        down = (down * (n - 1) + downval) / n

        if down == 0:
            rsi[i] = 100.0
        else:
            rs = up / down
            rsi[i] = 100. - 100. / (1. + rs)

    return rsi


class RsiReversal(Strategy):
    rsi_period = 14
    overbought = 70
    oversold = 30

    def init(self):
        close = self.data.Close
        self.rsi = self.I(RSI, close, self.rsi_period)

    def next(self):
        if self.rsi[-1] < self.oversold:
            if not self.position:
                self.buy()
        elif self.rsi[-1] > self.overbought:
            if self.position:
                self.sell()


STRATEGY_CODE = '''
from backtesting import Strategy
import numpy as np

def RSI(values, n=14):
    """计算 RSI 指标"""
    deltas = np.diff(values)
    seed = deltas[:n]
    up = seed[seed >= 0].sum() / n
    down = -seed[seed < 0].sum() / n
    if down == 0:
        rs = 100.0
    else:
        rs = up / down
    rsi = np.zeros_like(values, dtype=float)
    rsi[:n] = 100. - 100. / (1. + rs)

    for i in range(n, len(values)):
        delta = deltas[i - 1]
        if delta > 0:
            upval = delta
            downval = 0.
        else:
            upval = 0.
            downval = -delta

        up = (up * (n - 1) + upval) / n
        down = (down * (n - 1) + downval) / n

        if down == 0:
            rsi[i] = 100.0
        else:
            rs = up / down
            rsi[i] = 100. - 100. / (1. + rs)

    return rsi


class RsiReversal(Strategy):
    rsi_period = 14
    overbought = 70
    oversold = 30

    def init(self):
        close = self.data.Close
        self.rsi = self.I(RSI, close, self.rsi_period)

    def next(self):
        if self.rsi[-1] < self.oversold:
            if not self.position:
                self.buy()
        elif self.rsi[-1] > self.overbought:
            if self.position:
                self.sell()
'''

STRATEGY_META = {
    "name": "RSI Reversal",
    "description": "RSI 超买超卖反转策略 — RSI 低于 30 买入，高于 70 卖出。经典的均值回归策略。",
    "tags": ["mean-reversion", "rsi", "oscillator"],
    "params": {
        "rsi_period": {"type": "int", "default": 14, "min": 2, "max": 50, "description": "RSI 周期"},
        "overbought": {"type": "int", "default": 70, "min": 50, "max": 95, "description": "超买阈值"},
        "oversold": {"type": "int", "default": 30, "min": 5, "max": 50, "description": "超卖阈值"},
    },
}
