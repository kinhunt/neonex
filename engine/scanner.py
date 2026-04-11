"""
批量扫描模块 - 跨标的和时间框架的批量优化扫描
"""
import time
import signal
import traceback
from typing import Optional, Callable, Dict

from data_fetcher import fetch_ohlcv
from optimizer import run_optimization, _compute_composite_scores, DEFAULT_WEIGHTS

SCAN_TIMEOUT = 600  # 扫描总超时 600 秒


class ScanTimeoutError(Exception):
    pass


def _scan_timeout_handler(signum, frame):
    raise ScanTimeoutError("扫描超时（>600s），请减少标的或时间框架数量")


def run_scan(
    code: str,
    symbols: list,
    timeframes: list,
    param_ranges: dict,
    optimize_target: str = "sharpe",
    in_sample_ratio: float = 0.7,
    period: str = "6M",
    cash: float = 10000,
    commission: float = 0.001,
    progress_callback: Optional[Callable] = None,
    weights: Optional[Dict[str, float]] = None,
) -> dict:
    """
    跨标的和时间框架批量扫描。

    Args:
        code: 策略代码
        symbols: 标的列表 ["WOKB/USDT", "XETH/USDT"]
        timeframes: 时间框架列表 ["1h", "4h"]
        param_ranges: 参数范围
        optimize_target: 优化目标（向后兼容）
        in_sample_ratio: 样本内比例
        period: 数据周期
        cash: 初始资金
        commission: 手续费
        progress_callback: 进度回调 fn(current, total, result)
        weights: 自定义评分权重（可选）

    Returns:
        扫描结果字典
    """
    start_time = time.time()

    scoring_weights = weights if weights else DEFAULT_WEIGHTS.copy()

    # 设置超时
    old_handler = signal.signal(signal.SIGALRM, _scan_timeout_handler)
    signal.alarm(SCAN_TIMEOUT)

    try:
        combos = [(s, tf) for s in symbols for tf in timeframes]
        total = len(combos)
        results = []
        total_runs = 0
        errors = []

        for i, (symbol, timeframe) in enumerate(combos):
            try:
                # 拉取数据
                data = fetch_ohlcv(
                    symbol=symbol,
                    timeframe=timeframe,
                    period=period,
                )

                if data.empty or len(data) < 40:
                    errors.append({
                        "symbol": symbol,
                        "timeframe": timeframe,
                        "error": f"数据不足 ({len(data)} 根K线)",
                    })
                    continue

                # 运行优化（传递 weights）
                opt_result = run_optimization(
                    code=code,
                    data=data,
                    param_ranges=param_ranges,
                    optimize_target=optimize_target,
                    in_sample_ratio=in_sample_ratio,
                    cash=cash,
                    commission=commission,
                    weights=scoring_weights,
                )

                if "error" in opt_result:
                    errors.append({
                        "symbol": symbol,
                        "timeframe": timeframe,
                        "error": opt_result["error"],
                    })
                    continue

                entry = {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "bestParams": opt_result["bestParams"],
                    "inSample": opt_result["inSample"],
                    "outSample": opt_result["outSample"],
                    "paramSensitivity": opt_result["paramSensitivity"],
                    "overfittingWarning": opt_result["overfittingWarning"],
                }
                results.append(entry)
                total_runs += opt_result.get("totalRuns", 0)

                # 进度回调
                if progress_callback:
                    try:
                        progress_callback(i + 1, total, entry)
                    except Exception:
                        pass

            except Exception as e:
                errors.append({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "error": str(e),
                })

        # 按 outSample compositeScore 排序
        results.sort(
            key=lambda r: r["outSample"].get("compositeScore", 0),
            reverse=True,
        )

        # 计算稳健度评分（基于 compositeScore）
        robustness_score = 0.0
        if results:
            out_scores = [r["outSample"].get("compositeScore", 0) for r in results]
            max_score = max(out_scores) if out_scores else 0
            avg_score = sum(out_scores) / len(out_scores) if out_scores else 0

            if max_score > 0:
                robustness_score = round((avg_score / max_score) * 100, 2)
            else:
                robustness_score = 0.0

        elapsed = round(time.time() - start_time, 2)

        return {
            "results": results,
            "robustnessScore": robustness_score,
            "totalRuns": total_runs,
            "totalElapsedSeconds": elapsed,
            "bestOverall": results[0] if results else None,
            "errors": errors if errors else None,
        }

    except ScanTimeoutError as e:
        return {"error": str(e)}
    except Exception as e:
        return {
            "error": f"扫描失败: {str(e)}",
            "traceback": traceback.format_exc(),
        }
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
