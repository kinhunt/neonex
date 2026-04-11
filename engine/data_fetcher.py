"""
数据采集模块 - 从 OKX 拉取 K 线数据，带 SQLite 缓存
"""
import ccxt
import pandas as pd
import sqlite3
import os
import time
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "cache.db")

# XLayer 标的映射 → OKX 实际交易对
XLAYER_SYMBOL_MAP = {
    "WOKB/USDT": "OKB/USDT",
    "XETH/USDT": "ETH/USDT",
    "XBTC/USDT": "BTC/USDT",
    "XSOL/USDT": "SOL/USDT",
}

SUPPORTED_SYMBOLS = [
    "ETH/USDT", "BTC/USDT", "OKB/USDT",
    "WOKB/USDT", "XETH/USDT", "XBTC/USDT", "XSOL/USDT",
]
SUPPORTED_TIMEFRAMES = ["1h", "4h", "1d"]

# 每个 timeframe 对应的毫秒数
TF_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}

# 默认拉取的 K 线数量
DEFAULT_LIMITS = {
    "1h": 500,
    "4h": 500,
    "1d": 365,
}


def _init_db():
    """初始化 SQLite 缓存表"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ohlcv (
            symbol TEXT,
            timeframe TEXT,
            timestamp INTEGER,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            PRIMARY KEY (symbol, timeframe, timestamp)
        )
    """)
    conn.commit()
    conn.close()


def _get_cached(symbol: str, timeframe: str, since: int = None) -> pd.DataFrame:
    """从缓存读取数据"""
    conn = sqlite3.connect(DB_PATH)
    query = "SELECT timestamp, open, high, low, close, volume FROM ohlcv WHERE symbol=? AND timeframe=?"
    params = [symbol, timeframe]
    if since:
        query += " AND timestamp >= ?"
        params.append(since)
    query += " ORDER BY timestamp ASC"
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df.set_index("timestamp", inplace=True)
        df.columns = ["Open", "High", "Low", "Close", "Volume"]
    return df


def _save_to_cache(symbol: str, timeframe: str, data: list):
    """保存数据到缓存"""
    if not data:
        return
    conn = sqlite3.connect(DB_PATH)
    for row in data:
        conn.execute(
            "INSERT OR REPLACE INTO ohlcv (symbol, timeframe, timestamp, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?,?)",
            (symbol, timeframe, row[0], row[1], row[2], row[3], row[4], row[5]),
        )
    conn.commit()
    conn.close()


def fetch_ohlcv(
    symbol: str = "ETH/USDT",
    timeframe: str = "1h",
    limit: int = None,
    period: str = None,
) -> pd.DataFrame:
    """
    拉取 K 线数据。优先从缓存读取，缺失部分从 OKX 补充。

    Args:
        symbol: 交易对，如 ETH/USDT
        timeframe: K 线周期，如 1h, 4h, 1d
        limit: 拉取数量
        period: 时间范围，如 "6M", "1Y", "3M"

    Returns:
        pandas DataFrame with columns: Open, High, Low, Close, Volume
    """
    _init_db()

    # XLayer 标的映射：用户传 WOKB/USDT → 内部用 OKB/USDT 从 OKX 拉数据
    exchange_symbol = XLAYER_SYMBOL_MAP.get(symbol, symbol)

    if limit is None:
        limit = DEFAULT_LIMITS.get(timeframe, 500)

    # 根据 period 计算 since
    since = None
    if period:
        now = datetime.utcnow()
        period_map = {
            "1M": timedelta(days=30),
            "3M": timedelta(days=90),
            "6M": timedelta(days=180),
            "1Y": timedelta(days=365),
            "2Y": timedelta(days=730),
        }
        delta = period_map.get(period.upper(), timedelta(days=180))
        since = int((now - delta).timestamp() * 1000)

    # 先查缓存
    cached = _get_cached(symbol, timeframe, since)

    # 判断是否需要从交易所拉取
    need_fetch = cached.empty or len(cached) < limit * 0.8

    if need_fetch:
        try:
            exchange = ccxt.okx({"enableRateLimit": True})
            
            fetch_since = since
            if fetch_since is None:
                tf_ms = TF_MS.get(timeframe, 3_600_000)
                fetch_since = int((datetime.utcnow().timestamp() * 1000) - (limit * tf_ms))

            all_data = []
            current_since = fetch_since
            remaining = limit

            while remaining > 0:
                batch_limit = min(remaining, 300)  # OKX 每次最多 300
                ohlcv = exchange.fetch_ohlcv(
                    exchange_symbol, timeframe, since=current_since, limit=batch_limit
                )
                if not ohlcv:
                    break
                all_data.extend(ohlcv)
                remaining -= len(ohlcv)
                current_since = ohlcv[-1][0] + 1
                if len(ohlcv) < batch_limit:
                    break
                time.sleep(0.2)  # rate limit

            _save_to_cache(symbol, timeframe, all_data)

            # 重新从缓存读取（确保一致性）
            cached = _get_cached(symbol, timeframe, since)

        except Exception as e:
            print(f"[data_fetcher] Exchange fetch error: {e}")
            # 如果有缓存就用缓存，没有就抛异常
            if cached.empty:
                raise RuntimeError(f"无法获取数据且无缓存: {e}")

    # 截取需要的数量
    if len(cached) > limit:
        cached = cached.tail(limit)

    return cached


def get_latest_data(
    symbol: str = "ETH/USDT",
    timeframe: str = "1h",
    limit: int = 100,
) -> pd.DataFrame:
    """获取最新的 K 线数据（用于信号生成）"""
    return fetch_ohlcv(symbol=symbol, timeframe=timeframe, limit=limit)


if __name__ == "__main__":
    # 测试
    df = fetch_ohlcv("BTC/USDT", "1d", limit=30)
    print(f"Fetched {len(df)} candles")
    print(df.tail())
