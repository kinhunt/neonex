"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ParamDef,
  OptimizeResult,
  SymbolInfo,
  runOptimize,
} from "@/lib/api";

interface ParamRange {
  min: number;
  max: number;
  step: number;
}

interface ScoringWeights {
  sharpe: number;
  return: number;
  winRate: number;
  drawdown: number;
  profitFactor: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  sharpe: 30,
  return: 25,
  winRate: 15,
  drawdown: 20,
  profitFactor: 10,
};

interface OptimizerPanelProps {
  code: string;
  params: Record<string, ParamDef>;
  symbols: SymbolInfo[];
  timeframes: string[];
  onApplyParams?: (params: Record<string, number>) => void;
  onClose?: () => void;
}

export default function OptimizerPanel({
  code,
  params,
  symbols,
  timeframes,
  onApplyParams,
  onClose,
}: OptimizerPanelProps) {
  // Config state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(
    symbols.filter((s) => s.available).slice(0, 1).map((s) => s.symbol)
  );
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["1h"]);
  const [weights, setWeights] = useState<ScoringWeights>({ ...DEFAULT_WEIGHTS });
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [paramRanges, setParamRanges] = useState<Record<string, ParamRange>>(() => {
    const ranges: Record<string, ParamRange> = {};
    Object.entries(params).forEach(([key, def]) => {
      const defVal = def.default;
      const step = def.step || (def.type === "int" ? 1 : 0.1);
      ranges[key] = {
        min: def.min ?? Math.max(1, Math.floor(defVal * 0.3)),
        max: def.max ?? Math.ceil(defVal * 3),
        step,
      };
    });
    return ranges;
  });

  // Execution state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estimate total backtests
  const estimate = useMemo(() => {
    let paramCombos = 1;
    Object.values(paramRanges).forEach((r) => {
      const steps = Math.max(1, Math.floor((r.max - r.min) / r.step) + 1);
      paramCombos *= steps;
    });
    const total = paramCombos * selectedSymbols.length * selectedTimeframes.length;
    const estimatedSeconds = Math.ceil(total * 0.5);
    return { total, estimatedSeconds, paramCombos };
  }, [paramRanges, selectedSymbols, selectedTimeframes]);

  const weightsTotal = useMemo(() => {
    return weights.sharpe + weights.return + weights.winRate + weights.drawdown + weights.profitFactor;
  }, [weights]);

  const toggleSymbol = (sym: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  };

  const updateRange = (key: string, field: keyof ParamRange, value: number) => {
    setParamRanges((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const handleRun = useCallback(async () => {
    if (selectedSymbols.length === 0 || selectedTimeframes.length === 0) {
      setError("Select at least one symbol and timeframe");
      return;
    }

    setRunning(true);
    setProgress(0);
    setError(null);
    setResult(null);

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 0.05, 0.95));
    }, 1000);

    try {
      // Normalize weights to 0-1 for the API
      const total = weightsTotal || 1;
      const normalizedWeights: Record<string, number> = {
        sharpe: weights.sharpe / total,
        return: weights.return / total,
        winRate: weights.winRate / total,
        drawdown: weights.drawdown / total,
        profitFactor: weights.profitFactor / total,
      };

      const optimResult = await runOptimize({
        code,
        symbol: selectedSymbols[0],
        timeframe: selectedTimeframes[0],
        paramRanges,
        weights: normalizedWeights,
      });
      setResult(optimResult);
      setProgress(1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Optimization failed";
      setError(msg);
    } finally {
      clearInterval(progressInterval);
      setRunning(false);
    }
  }, [code, selectedSymbols, selectedTimeframes, paramRanges, weights, weightsTotal]);

  return (
    <div className="bg-bs-card border border-bs-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-bs-border">
        <h3 className="text-lg font-semibold">🔬 Strategy Optimizer</h3>
        {onClose && (
          <button onClick={onClose} className="text-bs-muted hover:text-white transition-colors">
            ✕
          </button>
        )}
      </div>

      {!result ? (
        <div className="p-5 space-y-5">
          {/* Symbol Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Symbols</label>
            <div className="flex flex-wrap gap-2">
              {symbols.filter((s) => s.available).map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => toggleSymbol(s.symbol)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    selectedSymbols.includes(s.symbol)
                      ? "bg-bs-purple text-white"
                      : "bg-bs-input border border-bs-border text-bs-muted hover:border-bs-purple/50"
                  }`}
                >
                  {s.symbol.split("/")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Timeframes</label>
            <div className="flex flex-wrap gap-2">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => toggleTimeframe(tf)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    selectedTimeframes.includes(tf)
                      ? "bg-bs-purple text-white"
                      : "bg-bs-input border border-bs-border text-bs-muted hover:border-bs-purple/50"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Scoring Weights (Collapsible) */}
          <div className="border border-bs-border rounded-lg overflow-hidden">
            <button
              onClick={() => setWeightsOpen(!weightsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-bs-input hover:bg-bs-card-hover transition-colors"
            >
              <span className="text-sm font-medium">⚖️ Scoring Weights</span>
              <span className="text-bs-muted text-xs">{weightsOpen ? "▲" : "▼"}</span>
            </button>
            {weightsOpen && (
              <div className="p-4 space-y-3 bg-bs-input/50">
                {([
                  { key: "sharpe" as const, label: "Sharpe Ratio" },
                  { key: "return" as const, label: "Return" },
                  { key: "winRate" as const, label: "Win Rate" },
                  { key: "drawdown" as const, label: "Max Drawdown" },
                  { key: "profitFactor" as const, label: "Profit Factor" },
                ]).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm w-28 truncate">{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={weights[key]}
                      onChange={(e) => updateWeight(key, Number(e.target.value))}
                      className="flex-1 accent-bs-purple"
                    />
                    <span className="text-xs text-bs-muted w-10 text-right font-mono">
                      {weightsTotal > 0 ? Math.round((weights[key] / weightsTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
                <div className="text-xs text-bs-muted text-right pt-1 border-t border-bs-border/50">
                  Raw total: {weightsTotal} (auto-normalized)
                </div>
              </div>
            )}
          </div>

          {/* Parameter Ranges */}
          <div>
            <label className="block text-sm font-medium mb-2">Parameter Ranges</label>
            <div className="space-y-3">
              {Object.entries(paramRanges).map(([key, range]) => (
                <div key={key} className="bg-bs-input rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono font-medium">{key}</span>
                    <span className="text-xs text-bs-muted">
                      {range.min} → {range.max} (step {range.step})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-bs-muted">Min</label>
                      <input
                        type="number"
                        value={range.min}
                        onChange={(e) => updateRange(key, "min", Number(e.target.value))}
                        className="w-full px-2 py-1 bg-bs-card border border-bs-border rounded text-sm text-center focus:outline-none focus:border-bs-purple"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-bs-muted">Max</label>
                      <input
                        type="number"
                        value={range.max}
                        onChange={(e) => updateRange(key, "max", Number(e.target.value))}
                        className="w-full px-2 py-1 bg-bs-card border border-bs-border rounded text-sm text-center focus:outline-none focus:border-bs-purple"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-bs-muted">Step</label>
                      <input
                        type="number"
                        value={range.step}
                        onChange={(e) => updateRange(key, "step", Number(e.target.value))}
                        className="w-full px-2 py-1 bg-bs-card border border-bs-border rounded text-sm text-center focus:outline-none focus:border-bs-purple"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(paramRanges).length === 0 && (
                <p className="text-sm text-bs-muted text-center py-4">
                  No tunable parameters found. Generate or edit code first.
                </p>
              )}
            </div>
          </div>

          {/* Estimate */}
          <div className="bg-bs-input rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                Estimated: <span className="text-bs-purple">{estimate.total.toLocaleString()}</span> backtests
              </p>
              <p className="text-xs text-bs-muted">
                ~{estimate.estimatedSeconds > 60
                  ? `${Math.ceil(estimate.estimatedSeconds / 60)} min`
                  : `${estimate.estimatedSeconds}s`}
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={running || Object.keys(paramRanges).length === 0}
              className="px-6 py-2.5 bg-bs-purple text-white font-semibold rounded-lg hover:bg-bs-purple-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {running && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {running ? "Optimizing..." : "🚀 Start Optimization"}
            </button>
          </div>

          {/* Progress Bar */}
          {running && (
            <div>
              <div className="w-full h-2 bg-bs-input rounded-full overflow-hidden">
                <div
                  className="h-full bg-bs-purple rounded-full transition-all duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="text-xs text-bs-muted mt-1 text-center">
                {(progress * 100).toFixed(0)}% complete
              </p>
            </div>
          )}

          {error && (
            <div className="px-4 py-2 bg-bs-red/10 border border-bs-red/30 rounded-lg text-sm text-bs-red">
              {error}
            </div>
          )}
        </div>
      ) : (
        /* Results View */
        <OptimizerResults
          result={result}
          onApply={onApplyParams}
          onReset={() => setResult(null)}
        />
      )}
    </div>
  );
}

// ─── Results View ──────────────────────────────────────────────
function OptimizerResults({
  result,
  onApply,
  onReset,
}: {
  result: OptimizeResult;
  onApply?: (params: Record<string, number>) => void;
  onReset: () => void;
}) {
  const topResults = (result.allResults || [])
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
    .slice(0, 10);

  return (
    <div className="p-5 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-bs-input rounded-lg p-3 text-center">
          <p className="text-[10px] text-bs-muted uppercase">Total Runs</p>
          <p className="text-lg font-bold">{result.totalRuns}</p>
        </div>
        <div className="bg-bs-input rounded-lg p-3 text-center">
          <p className="text-[10px] text-bs-muted uppercase">Duration</p>
          <p className="text-lg font-bold">{result.elapsedSeconds.toFixed(1)}s</p>
        </div>
        <div className="bg-bs-input rounded-lg p-3 text-center">
          <p className="text-[10px] text-bs-muted uppercase">In-Sample Sharpe</p>
          <p className="text-lg font-bold text-bs-green">
            {result.inSample?.sharpe?.toFixed(2) ?? "—"}
          </p>
        </div>
        <div className="bg-bs-input rounded-lg p-3 text-center">
          <p className="text-[10px] text-bs-muted uppercase">Out-Sample Sharpe</p>
          <p className={`text-lg font-bold ${result.overfittingWarning ? "text-bs-red" : "text-bs-green"}`}>
            {result.outSample?.sharpe?.toFixed(2) ?? "—"}
          </p>
        </div>
        <div className="bg-bs-input rounded-lg p-3 text-center">
          <p className="text-[10px] text-bs-muted uppercase">Composite Score</p>
          <p className="text-lg font-bold text-bs-purple">
            {result.inSample?.compositeScore != null
              ? (result.inSample.compositeScore * 100).toFixed(1)
              : "—"}
          </p>
        </div>
      </div>

      {/* Overfitting Warning */}
      {result.overfittingWarning && (
        <div className="px-4 py-3 bg-bs-red/10 border border-bs-red/30 rounded-lg flex items-start gap-2">
          <span className="text-bs-red text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-bs-red">Overfitting Detected</p>
            <p className="text-xs text-bs-muted">
              Out-of-sample performance is significantly lower than in-sample. Consider using fewer parameters or wider ranges.
            </p>
          </div>
        </div>
      )}

      {/* Best Params */}
      <div className="bg-bs-input rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">🏆 Best Parameters</h4>
          {onApply && (
            <button
              onClick={() => onApply(result.bestParams)}
              className="px-3 py-1 text-xs bg-bs-green text-black font-semibold rounded hover:bg-bs-green-dark transition-colors"
            >
              Apply
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(result.bestParams).map(([key, val]) => (
            <span key={key} className="px-2 py-1 bg-bs-card rounded text-sm font-mono">
              {key}: <span className="text-bs-purple font-bold">{val}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top 10 Results Table */}
      {topResults.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Top 10 Results</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bs-border text-bs-muted text-left">
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Params</th>
                  <th className="px-2 py-2 font-medium text-right">Sharpe</th>
                  <th className="px-2 py-2 font-medium text-right">Return</th>
                  <th className="px-2 py-2 font-medium text-right">MaxDD</th>
                  <th className="px-2 py-2 font-medium text-right">Win%</th>
                  <th className="px-2 py-2 font-medium text-right">Trades</th>
                  <th className="px-2 py-2 font-medium text-right">PF</th>
                  <th className="px-2 py-2 font-medium text-right">Score</th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {topResults.map((r, i) => (
                  <tr key={i} className="border-b border-bs-border/50 hover:bg-bs-card-hover">
                    <td className="px-2 py-2 text-bs-muted">{i + 1}</td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {Object.entries(r.params)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ")}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {r.sharpe?.toFixed(2) ?? "—"}
                    </td>
                    <td className={`px-2 py-2 text-right font-mono ${(r.return ?? 0) >= 0 ? "text-bs-green" : "text-bs-red"}`}>
                      {r.return != null ? `${r.return >= 0 ? "+" : ""}${r.return.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-bs-red">
                      {r.drawdown != null ? `${r.drawdown.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {r.winRate != null ? `${r.winRate.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-bs-muted">
                      {r.trades ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {r.profitFactor != null && r.profitFactor > 0 ? r.profitFactor.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-bs-purple font-bold">
                      {r.compositeScore != null ? (r.compositeScore * 100).toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {onApply && (
                        <button
                          onClick={() => onApply(r.params)}
                          className="px-2 py-0.5 text-[10px] bg-bs-purple/20 text-bs-purple rounded hover:bg-bs-purple/40 transition-colors"
                        >
                          Apply
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm text-bs-muted hover:text-white transition-colors"
        >
          ← Re-configure
        </button>
        {onApply && (
          <button
            onClick={() => onApply(result.bestParams)}
            className="px-6 py-2 bg-bs-green text-black text-sm font-semibold rounded-lg hover:bg-bs-green-dark transition-colors"
          >
            ✓ Apply Best Parameters
          </button>
        )}
      </div>
    </div>
  );
}
