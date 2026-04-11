"""
优化器模块 - 利用 backtesting.py 的 optimize() 实现批量参数优化
"""
import time
import math
import signal
import warnings
import sys
import traceback
from io import StringIO
from typing import Optional, Dict

import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy
from backtesting.lib import crossover

from backtester import load_strategy_class, _safe_float

OPTIMIZE_TIMEOUT = 300  # 单次优化超时 300 秒
MAX_COMBINATIONS = 50000  # 最大参数组合数

# 默认综合评分权重
DEFAULT_WEIGHTS = {
    "sharpe": 0.30,
    "return": 0.25,
    "winRate": 0.15,
    "drawdown": 0.20,  # drawdown 是负值，评分时反转（越小越好）
    "profitFactor": 0.10,
}

# 优化目标映射（兼容旧 API）
TARGET_MAP = {
    "sharpe": "Sharpe Ratio",
    "return": "Return [%]",
    "winrate": "Win Rate [%]",
}


class OptimizeTimeoutError(Exception):
    pass


def _opt_timeout_handler(signum, frame):
    raise OptimizeTimeoutError("优化超时（>300s），请缩小参数范围")


def _build_ranges(param_ranges: dict) -> dict:
    """
    将前端传来的 param_ranges 转为 backtesting.py optimize() 需要的 range() 参数。

    输入: { "sma_fast": {"min":5, "max":50, "step":5} }
    输出: { "sma_fast": range(5, 51, 5) }
    """
    ranges = {}
    for name, cfg in param_ranges.items():
        lo = int(cfg["min"])
        hi = int(cfg["max"])
        step = int(cfg.get("step", 1))
        # range 不含右端点，所以 +1
        ranges[name] = range(lo, hi + 1, step)
    return ranges


def _count_combinations(param_ranges: dict) -> int:
    """计算参数空间大小"""
    total = 1
    for name, cfg in param_ranges.items():
        lo = int(cfg["min"])
        hi = int(cfg["max"])
        step = int(cfg.get("step", 1))
        count = len(range(lo, hi + 1, step))
        total *= count
    return total


def _extract_stats(stats) -> dict:
    """从 backtesting.py stats 对象提取关键指标"""
    return {
        "sharpe": round(_safe_float(stats.get("Sharpe Ratio", 0)), 4),
        "return": round(_safe_float(stats.get("Return [%]", 0)), 2),
        "drawdown": round(_safe_float(stats.get("Max. Drawdown [%]", 0)), 2),
        "winRate": round(_safe_float(stats.get("Win Rate [%]", 0)), 2),
        "trades": int(_safe_float(stats.get("# Trades", 0))),
        "profitFactor": round(_safe_float(stats.get("Profit Factor", 0)), 4),
    }


def _to_python_type(val):
    """将 numpy 类型转换为 Python 原生类型，确保 JSON 可序列化"""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val


def _extract_best_params(stats, param_names: list) -> dict:
    """从 optimize 返回的 stats 中提取最优参数值"""
    params = {}
    # backtesting.py optimize 返回的 stats 中，参数在 stats._strategy 上
    strategy_instance = stats.get("_strategy", None)
    if strategy_instance is not None:
        for name in param_names:
            val = getattr(strategy_instance, name, None)
            if val is not None:
                params[name] = _to_python_type(val)
    # 如果上面取不到，从 stats series 里找
    if not params:
        for name in param_names:
            if name in stats.index:
                params[name] = _to_python_type(stats[name])
    return params


def _run_single_backtest(strategy_class, data, params, cash, commission):
    """用指定参数跑单次回测，返回 stats"""
    # 克隆参数到 class
    for k, v in params.items():
        setattr(strategy_class, k, v)

    max_price = float(data["Close"].max())
    if cash < max_price * 1.5:
        cash = max_price * 10

    bt = Backtest(
        data,
        strategy_class,
        cash=cash,
        commission=commission,
        exclusive_orders=True,
    )
    return bt.run()


def _compute_composite_scores(results: list, weights: Dict[str, float]) -> list:
    """
    对结果列表计算综合评分。

    1. 对每个指标做 min-max 归一化到 [0, 1]
    2. drawdown 取绝对值后反转（越小越好）
    3. 加权求和得到 compositeScore
    """
    if not results:
        return results

    # 归一化权重
    total_w = sum(weights.values())
    if total_w <= 0:
        total_w = 1.0
    norm_weights = {k: v / total_w for k, v in weights.items()}

    metrics = ["sharpe", "return", "winRate", "drawdown", "profitFactor"]

    # 收集每个指标的值
    values = {m: [] for m in metrics}
    for r in results:
        for m in metrics:
            if m == "drawdown":
                # drawdown 是负值，取绝对值
                values[m].append(abs(r.get(m, 0)))
            else:
                values[m].append(r.get(m, 0))

    # 计算 min-max 归一化参数
    norm_params = {}
    for m in metrics:
        vals = values[m]
        mn = min(vals)
        mx = max(vals)
        norm_params[m] = (mn, mx)

    # 计算每条结果的 compositeScore
    for i, r in enumerate(results):
        score = 0.0
        for m in metrics:
            mn, mx = norm_params[m]
            raw = values[m][i]

            # 归一化到 [0, 1]
            if mx - mn > 0:
                normalized = (raw - mn) / (mx - mn)
            else:
                normalized = 0.5  # 所有值相同时给 0.5

            if m == "drawdown":
                # drawdown 越小越好，反转
                normalized = 1.0 - normalized

            w = norm_weights.get(m, 0)
            score += w * normalized

        # trades=0 的组合严重惩罚（没交易 = 没意义）
        if r.get("trades", 0) == 0:
            score *= 0.05

        r["compositeScore"] = round(score, 6)

    return results


def run_optimization(
    code: str,
    data: pd.DataFrame,
    param_ranges: dict,
    optimize_target: str = "sharpe",
    in_sample_ratio: float = 0.7,
    cash: float = 10000,
    commission: float = 0.001,
    weights: Optional[Dict[str, float]] = None,
) -> dict:
    """
    运行参数优化。

    Args:
        code: 策略代码
        data: OHLCV DataFrame
        param_ranges: 参数范围 { "sma_fast": {"min":5, "max":50, "step":5} }
        optimize_target: 优化目标 (sharpe/return/drawdown/winrate) - 向后兼容
        in_sample_ratio: 样本内数据比例
        cash: 初始资金
        commission: 手续费率
        weights: 自定义评分权重（可选）

    Returns:
        优化结果字典
    """
    start_time = time.time()

    # 确定评分权重
    scoring_weights = weights if weights else DEFAULT_WEIGHTS.copy()

    # 检查参数空间大小
    total_combos = _count_combinations(param_ranges)
    if total_combos > MAX_COMBINATIONS:
        return {
            "error": f"参数空间太大 ({total_combos} 组合 > {MAX_COMBINATIONS} 上限)，请缩小范围或增大 step",
        }

    # 设置超时
    old_handler = signal.signal(signal.SIGALRM, _opt_timeout_handler)
    signal.alarm(OPTIMIZE_TIMEOUT)

    try:
        strategy_class = load_strategy_class(code)

        # 样本内/外切分
        split_idx = int(len(data) * in_sample_ratio)
        in_sample_data = data.iloc[:split_idx].copy()
        out_sample_data = data.iloc[split_idx:].copy()

        if len(in_sample_data) < 30:
            return {"error": f"样本内数据不足 ({len(in_sample_data)} 根K线)，至少需要 30 根"}
        if len(out_sample_data) < 10:
            return {"error": f"样本外数据不足 ({len(out_sample_data)} 根K线)，至少需要 10 根"}

        # 自动调整 cash
        max_price = float(data["Close"].max())
        if cash < max_price * 1.5:
            cash = max_price * 10

        # 构建 optimize 参数
        ranges = _build_ranges(param_ranges)
        param_names = list(param_ranges.keys())

        # backtesting.py optimize() 始终用 Sharpe Ratio 作为初始排序
        maximize_arg = "Sharpe Ratio"

        # 跑样本内优化
        warnings.filterwarnings("ignore")
        old_stdout = sys.stdout
        sys.stdout = StringIO()

        try:
            bt_in = Backtest(
                in_sample_data,
                strategy_class,
                cash=cash,
                commission=commission,
                exclusive_orders=True,
            )

            opt_result = bt_in.optimize(
                **ranges,
                maximize=maximize_arg,
                return_heatmap=True,
            )
        finally:
            sys.stdout = old_stdout

        # 解析结果
        if isinstance(opt_result, tuple):
            best_stats, heatmap = opt_result
        else:
            best_stats = opt_result
            heatmap = None

        best_params = _extract_best_params(best_stats, param_names)
        in_sample_metrics = _extract_stats(best_stats)

        # 样本外回测
        out_strategy_class = load_strategy_class(code)
        out_stats = _run_single_backtest(
            out_strategy_class, out_sample_data, best_params, cash, commission
        )
        out_sample_metrics = _extract_stats(out_stats)

        # 过拟合检测
        in_sharpe = in_sample_metrics["sharpe"]
        out_sharpe = out_sample_metrics["sharpe"]
        overfitting_warning = False
        if in_sharpe > 0:
            overfitting_warning = (out_sharpe / in_sharpe) < 0.5

        # 参数敏感度：对最优参数 ±1 step 做回测
        sensitivity_sharpes = [in_sharpe]  # 包含最优的
        for pname in param_names:
            step = int(param_ranges[pname].get("step", 1))
            lo = int(param_ranges[pname]["min"])
            hi = int(param_ranges[pname]["max"])
            base_val = best_params.get(pname, lo)

            for delta in [-step, step]:
                neighbor_val = base_val + delta
                if neighbor_val < lo or neighbor_val > hi:
                    continue

                neighbor_params = dict(best_params)
                neighbor_params[pname] = neighbor_val

                try:
                    nb_class = load_strategy_class(code)
                    nb_stats = _run_single_backtest(
                        nb_class, in_sample_data, neighbor_params, cash, commission
                    )
                    nb_sharpe = _safe_float(nb_stats.get("Sharpe Ratio", 0))
                    sensitivity_sharpes.append(nb_sharpe)
                except Exception:
                    pass

        param_sensitivity = round(float(np.std(sensitivity_sharpes)), 4) if len(sensitivity_sharpes) > 1 else 0.0

        # 构建 allResults（从 heatmap 提取初始列表）
        all_results_raw = []
        if heatmap is not None:
            try:
                if isinstance(heatmap.index, pd.MultiIndex):
                    for idx, val in heatmap.items():
                        entry = {"params": {}}
                        for i, pname in enumerate(param_names):
                            entry["params"][pname] = _to_python_type(idx[i] if isinstance(idx, tuple) else idx)
                        entry["sharpe"] = round(_safe_float(val), 4)
                        entry["score"] = round(_safe_float(val), 4)
                        all_results_raw.append(entry)
                else:
                    for idx, val in heatmap.items():
                        entry = {
                            "params": {param_names[0]: _to_python_type(idx)},
                            "sharpe": round(_safe_float(val), 4),
                            "score": round(_safe_float(val), 4),
                        }
                        all_results_raw.append(entry)
            except Exception:
                pass

        # 按 sharpe 降序排列，取 Top 20 重跑完整回测
        all_results_raw.sort(key=lambda r: r.get("sharpe", 0), reverse=True)
        top_n = min(20, len(all_results_raw))

        all_results = []
        for i, raw_entry in enumerate(all_results_raw[:top_n]):
            try:
                rerun_class = load_strategy_class(code)
                rerun_stats = _run_single_backtest(
                    rerun_class, in_sample_data, raw_entry["params"], cash, commission
                )
                full_metrics = _extract_stats(rerun_stats)
                entry = {
                    "params": raw_entry["params"],
                    **full_metrics,
                }
                all_results.append(entry)
            except Exception:
                # 回测失败时用 heatmap 的基本数据
                entry = {
                    "params": raw_entry["params"],
                    "sharpe": raw_entry.get("sharpe", 0),
                    "return": 0,
                    "drawdown": 0,
                    "winRate": 0,
                    "trades": 0,
                    "profitFactor": 0,
                }
                all_results.append(entry)

        # 对剩余的结果（Top 20 之后的），也重跑获取完整指标
        for raw_entry in all_results_raw[top_n:]:
            try:
                rerun_class = load_strategy_class(code)
                rerun_stats = _run_single_backtest(
                    rerun_class, in_sample_data, raw_entry["params"], cash, commission
                )
                full_metrics = _extract_stats(rerun_stats)
                entry = {
                    "params": raw_entry["params"],
                    **full_metrics,
                }
                all_results.append(entry)
            except Exception:
                entry = {
                    "params": raw_entry["params"],
                    "sharpe": raw_entry.get("sharpe", 0),
                    "return": 0,
                    "drawdown": 0,
                    "winRate": 0,
                    "trades": 0,
                    "profitFactor": 0,
                }
                all_results.append(entry)

        # 计算 compositeScore
        all_results = _compute_composite_scores(all_results, scoring_weights)

        # 按 compositeScore 降序排序
        all_results.sort(key=lambda r: r.get("compositeScore", 0), reverse=True)

        # 为 inSample 和 outSample 也计算 compositeScore
        in_sample_list = _compute_composite_scores([dict(in_sample_metrics)], scoring_weights)
        in_sample_metrics = in_sample_list[0]

        out_sample_list = _compute_composite_scores([dict(out_sample_metrics)], scoring_weights)
        out_sample_metrics = out_sample_list[0]

        # 如果 allResults 排序后最优不同于 backtesting.py 的最优，更新 bestParams
        if all_results and all_results[0]["params"] != best_params:
            # 用 compositeScore 最高的作为新 bestParams
            new_best_params = all_results[0]["params"]
            # 重新跑样本外
            try:
                new_out_class = load_strategy_class(code)
                new_out_stats = _run_single_backtest(
                    new_out_class, out_sample_data, new_best_params, cash, commission
                )
                out_sample_metrics = _extract_stats(new_out_stats)
                out_sample_list = _compute_composite_scores([dict(out_sample_metrics)], scoring_weights)
                out_sample_metrics = out_sample_list[0]

                # 重新跑样本内获取完整指标
                new_in_class = load_strategy_class(code)
                new_in_stats = _run_single_backtest(
                    new_in_class, in_sample_data, new_best_params, cash, commission
                )
                in_sample_metrics = _extract_stats(new_in_stats)
                in_sample_list = _compute_composite_scores([dict(in_sample_metrics)], scoring_weights)
                in_sample_metrics = in_sample_list[0]

                best_params = new_best_params

                # 重新计算过拟合
                in_sharpe = in_sample_metrics["sharpe"]
                out_sharpe = out_sample_metrics["sharpe"]
                overfitting_warning = False
                if in_sharpe > 0:
                    overfitting_warning = (out_sharpe / in_sharpe) < 0.5
            except Exception:
                pass  # 失败时保留原始 bestParams

        elapsed = round(time.time() - start_time, 2)

        return {
            "bestParams": best_params,
            "inSample": in_sample_metrics,
            "outSample": out_sample_metrics,
            "paramSensitivity": param_sensitivity,
            "overfittingWarning": overfitting_warning,
            "allResults": all_results[:500],  # 限制返回数量
            "totalRuns": total_combos,
            "elapsedSeconds": elapsed,
        }

    except OptimizeTimeoutError as e:
        return {"error": str(e)}
    except Exception as e:
        return {
            "error": f"优化失败: {str(e)}",
            "traceback": traceback.format_exc(),
        }
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
