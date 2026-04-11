"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  fetchStrategy,
  fetchBacktest,
  runBacktest,
  forkStrategy,
  fetchSymbols,
  Strategy,
  BacktestResult,
  Configuration,
  SymbolInfo,
  getAuthorName,
  getBestConfig,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] bg-bs-input rounded-lg animate-pulse" />
  ),
});

const EquityChart = dynamic(() => import("@/components/EquityChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] bs-skeleton rounded-lg" />
  ),
});

type Tab = "performance" | "parameters" | "code";

export default function StrategyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const id = params.id as string;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("performance");

  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>(["1h", "4h", "1d"]);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [backtesting, setBacktesting] = useState(false);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    Promise.all([fetchStrategy(id), fetchBacktest(id), fetchSymbols()])
      .then(([s, b, symData]) => {
        setStrategy(s);
        setBacktest(b);
        setSymbols(symData.symbols || []);
        setTimeframes(symData.timeframes || ["1h", "4h", "1d"]);
        // Set default symbol/timeframe from best config or fallback
        const best = getBestConfig(s);
        setSymbol(best?.symbol || symData.defaultSymbol || "WOKB/USDT");
        setTimeframe(best?.timeframe || symData.defaultTimeframe || "1h");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBacktest = useCallback(async () => {
    setBacktesting(true);
    try {
      const result = await runBacktest(id, symbol, timeframe);
      setBacktest(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Backtest failed";
      alert(msg);
    } finally {
      setBacktesting(false);
    }
  }, [id, symbol, timeframe]);

  const handleFork = useCallback(async () => {
    if (!isLoggedIn) {
      alert("Please connect your wallet to fork.");
      return;
    }
    if (!strategy) return;
    const code = strategy.currentVersion?.code || strategy.code || "";
    if (!code) {
      alert("Strategy has no code to fork.");
      return;
    }
    setForking(true);
    try {
      const forked = await forkStrategy(id, code);
      router.push(`/strategy/${forked.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Fork failed";
      alert(msg);
    } finally {
      setForking(false);
    }
  }, [id, router, isLoggedIn, strategy]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bs-skeleton h-10 w-64" />
        <div className="bs-skeleton h-6 w-96" />
        <div className="flex gap-4">
          <div className="bs-skeleton h-8 w-32" />
          <div className="bs-skeleton h-8 w-32" />
          <div className="bs-skeleton h-8 w-32" />
        </div>
        <div className="bs-skeleton h-[350px]" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="text-center py-20">
        <p className="text-bs-red mb-2">Failed to load strategy</p>
        <p className="text-bs-muted text-sm">{error}</p>
      </div>
    );
  }

  const bestConfig = getBestConfig(strategy);
  const metrics = backtest?.metrics;
  const code = strategy.currentVersion?.code || strategy.code || "# No code available";
  const authorName = getAuthorName(strategy);

  const tabs: { key: Tab; label: string }[] = [
    { key: "performance", label: "Performance" },
    { key: "parameters", label: "Parameters" },
    { key: "code", label: "Code" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 break-words">
            {strategy.name}
          </h1>
          <p className="text-bs-muted mb-2 break-words">{strategy.description}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-bs-muted">
            <span className="truncate max-w-[200px]">by {authorName}</span>
            {bestConfig && (
              <>
                <span>•</span>
                <span className="px-2 py-0.5 text-xs rounded bg-bs-purple/20 text-bs-purple font-medium">
                  {bestConfig.symbol.split("/")[0]}
                </span>
                <span className="px-2 py-0.5 text-xs rounded bg-bs-border text-bs-muted">
                  {bestConfig.timeframe}
                </span>
              </>
            )}
            {strategy.robustnessScore != null && strategy.robustnessScore > 0 && (
              <>
                <span>•</span>
                <span className="px-2 py-0.5 text-xs rounded bg-bs-green/10 text-bs-green font-medium">
                  Robustness: {strategy.robustnessScore.toFixed(0)}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(strategy.tags || []).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-0.5 text-xs rounded-full bg-bs-border text-bs-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleFork}
            disabled={forking}
            className="px-4 py-2 border border-bs-border text-sm rounded-lg hover:border-bs-purple hover:text-bs-purple transition-colors disabled:opacity-50"
          >
            {forking ? "Forking..." : "🍴 Fork"}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-bs-border">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? "text-bs-purple"
                  : "text-bs-muted hover:text-white"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-bs-purple" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "performance" && (
        <PerformanceTab
          strategy={strategy}
          backtest={backtest}
          metrics={metrics || null}
          symbols={symbols}
          timeframes={timeframes}
          symbol={symbol}
          timeframe={timeframe}
          backtesting={backtesting}
          onSymbolChange={setSymbol}
          onTimeframeChange={setTimeframe}
          onBacktest={handleBacktest}
        />
      )}

      {activeTab === "parameters" && (
        <ParametersTab
          strategy={strategy}
          bestConfig={bestConfig}
        />
      )}

      {activeTab === "code" && (
        <CodeTab
          code={code}
          strategy={strategy}
        />
      )}
    </div>
  );
}

// ─── Performance Tab ───────────────────────────────────────────
function PerformanceTab({
  strategy,
  backtest,
  metrics,
  symbols,
  timeframes,
  symbol,
  timeframe,
  backtesting,
  onSymbolChange,
  onTimeframeChange,
  onBacktest,
}: {
  strategy: Strategy;
  backtest: BacktestResult | null;
  metrics: BacktestResult["metrics"] | null;
  symbols: SymbolInfo[];
  timeframes: string[];
  symbol: string;
  timeframe: string;
  backtesting: boolean;
  onSymbolChange: (s: string) => void;
  onTimeframeChange: (t: string) => void;
  onBacktest: () => void;
}) {
  const symbolList = symbols.length > 0
    ? symbols.map((s) => s.symbol)
    : ["WOKB/USDT", "XETH/USDT", "XBTC/USDT", "XSOL/USDT"];

  return (
    <div className="space-y-6">
      {/* Backtest Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          className="px-3 py-1.5 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple"
        >
          {symbolList.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={timeframe}
          onChange={(e) => onTimeframeChange(e.target.value)}
          className="px-3 py-1.5 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple"
        >
          {timeframes.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
        <button
          onClick={onBacktest}
          disabled={backtesting}
          className="px-4 py-1.5 bg-bs-purple text-white text-sm font-semibold rounded-lg hover:bg-bs-purple-dark transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {backtesting && (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {backtesting ? "Running..." : "▶ Run Backtest"}
        </button>
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard
            label="Total Return"
            value={`${metrics.total_return >= 0 ? "+" : ""}${metrics.total_return.toFixed(2)}%`}
            color={metrics.total_return >= 0 ? "green" : "red"}
          />
          <MetricCard
            label="Sharpe Ratio"
            value={metrics.sharpe_ratio.toFixed(2)}
            color={metrics.sharpe_ratio >= 1 ? "green" : "neutral"}
          />
          <MetricCard
            label="Max Drawdown"
            value={`${metrics.max_drawdown.toFixed(2)}%`}
            color="red"
          />
          <MetricCard
            label="Win Rate"
            value={`${metrics.win_rate.toFixed(1)}%`}
            color={metrics.win_rate >= 50 ? "green" : "red"}
          />
          <MetricCard
            label="Total Trades"
            value={String(metrics.total_trades)}
            color="neutral"
          />
        </div>
      )}

      {/* Large Equity Curve */}
      {backtest?.equity_curve && backtest.equity_curve.length > 0 && (
        <div className="bg-bs-card border border-bs-border rounded-xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
          <div className="h-[350px] sm:h-[400px]">
            <EquityChart data={backtest.equity_curve} />
          </div>
        </div>
      )}

      {/* Configurations List */}
      {strategy.configurations && strategy.configurations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Configurations</h3>
          <div className="bg-bs-card border border-bs-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bs-border text-bs-muted text-left">
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">TF</th>
                    <th className="px-4 py-3 font-medium text-right">Return</th>
                    <th className="px-4 py-3 font-medium text-right">Sharpe</th>
                    <th className="px-4 py-3 font-medium text-right">MaxDD</th>
                    <th className="px-4 py-3 font-medium text-right">Win%</th>
                    <th className="px-4 py-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {strategy.configurations.map((c: Configuration) => (
                    <tr key={c.id} className="border-b border-bs-border/50 hover:bg-bs-card-hover">
                      <td className="px-4 py-2.5 font-medium">
                        <span className="px-2 py-0.5 text-xs rounded bg-bs-purple/20 text-bs-purple">
                          {c.symbol.split("/")[0]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-bs-muted">{c.timeframe}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${(c.totalReturn ?? 0) >= 0 ? "text-bs-green" : "text-bs-red"}`}>
                        {c.totalReturn != null ? `${c.totalReturn >= 0 ? "+" : ""}${c.totalReturn.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {c.sharpeRatio?.toFixed(2) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-bs-red">
                        {c.maxDrawdown != null ? `${c.maxDrawdown.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {c.winRate != null ? `${c.winRate.toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.isOptimal && (
                          <span className="px-2 py-0.5 text-xs rounded bg-bs-green/10 text-bs-green">
                            ★ Best
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Trades Table */}
      {backtest?.trades && backtest.trades.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            Trade History ({backtest.trades.length} trades)
          </h3>
          <div className="bg-bs-card border border-bs-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bs-border text-bs-muted text-left">
                    <th className="px-4 py-3 font-medium">Entry</th>
                    <th className="px-4 py-3 font-medium">Exit</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium text-right">Entry $</th>
                    <th className="px-4 py-3 font-medium text-right">Exit $</th>
                    <th className="px-4 py-3 font-medium text-right">PnL %</th>
                  </tr>
                </thead>
                <tbody>
                  {backtest.trades.slice(0, 50).map((trade, i) => (
                    <tr key={i} className="border-b border-bs-border/50 hover:bg-bs-card-hover">
                      <td className="px-4 py-2.5 font-mono text-xs">{formatTime(trade.entry_time)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{formatTime(trade.exit_time)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                          trade.side === "long"
                            ? "bg-bs-green/20 text-bs-green"
                            : "bg-bs-red/20 text-bs-red"
                        }`}>
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{trade.entry_price.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{trade.exit_price.toFixed(2)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${trade.pnl_pct >= 0 ? "text-bs-green" : "text-bs-red"}`}>
                        {trade.pnl_pct >= 0 ? "+" : ""}{(trade.pnl_pct * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!backtest && !backtesting && (
        <div className="text-center py-12 text-bs-muted bg-bs-card border border-bs-border rounded-xl">
          <p className="text-lg mb-1">No backtest results yet</p>
          <p className="text-sm">
            Select a symbol and timeframe, then click &quot;Run Backtest&quot;
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Parameters Tab ────────────────────────────────────────────
function ParametersTab({
  strategy,
  bestConfig,
}: {
  strategy: Strategy;
  bestConfig: Configuration | null;
}) {
  const paramSchema = strategy.currentVersion?.paramSchema;
  const params = bestConfig?.params || {};

  return (
    <div className="space-y-6">
      {/* Parameter Display */}
      {(paramSchema && Object.keys(paramSchema).length > 0) || Object.keys(params).length > 0 ? (
        <div className="bg-bs-card border border-bs-border rounded-xl p-5">
          <h3 className="text-lg font-semibold mb-4">Strategy Parameters</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(paramSchema || {}).map(([key, def]) => (
              <div key={key} className="bg-bs-input rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium font-mono">{key}</span>
                  <span className="text-xs text-bs-muted">{def.type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-bs-muted text-xs">Default: {def.default}</span>
                  {params[key] !== undefined && (
                    <span className="text-bs-purple font-bold text-sm">
                      Current: {params[key]}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {/* Show params without schema */}
            {Object.entries(params)
              .filter(([key]) => !paramSchema || !(key in paramSchema))
              .map(([key, val]) => (
                <div key={key} className="bg-bs-input rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium font-mono">{key}</span>
                    <span className="text-bs-purple font-bold text-sm">{val}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-bs-muted bg-bs-card border border-bs-border rounded-xl">
          <p className="text-lg mb-1">No parameters extracted</p>
          <p className="text-sm">
            Parameters will appear after optimization
          </p>
        </div>
      )}

      {/* In-Sample vs Out-Sample */}
      {bestConfig && bestConfig.inSampleSharpe != null && (
        <div className="bg-bs-card border border-bs-border rounded-xl p-5">
          <h3 className="text-lg font-semibold mb-4">Sample Validation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-bs-input rounded-lg p-4 text-center">
              <p className="text-xs text-bs-muted mb-1">In-Sample Sharpe</p>
              <p className="text-2xl font-bold text-bs-green">
                {bestConfig.inSampleSharpe.toFixed(2)}
              </p>
            </div>
            <div className="bg-bs-input rounded-lg p-4 text-center">
              <p className="text-xs text-bs-muted mb-1">Out-Sample Sharpe</p>
              <p className={`text-2xl font-bold ${
                (bestConfig.outSampleSharpe ?? 0) < (bestConfig.inSampleSharpe ?? 0) * 0.5
                  ? "text-bs-red"
                  : "text-bs-green"
              }`}>
                {bestConfig.outSampleSharpe?.toFixed(2) ?? "—"}
              </p>
            </div>
          </div>
          {bestConfig.outSampleSharpe != null &&
            bestConfig.outSampleSharpe < (bestConfig.inSampleSharpe ?? 0) * 0.5 && (
              <div className="mt-3 px-4 py-2 bg-bs-red/10 border border-bs-red/30 rounded-lg text-sm text-bs-red">
                ⚠️ Overfitting Warning: Out-of-sample performance is significantly lower
              </div>
            )}
        </div>
      )}

      {/* Optimizer Entry */}
      <div className="bg-bs-card border border-bs-border rounded-xl p-5 text-center">
        <p className="text-bs-muted mb-3">
          Want to find the best parameters for this strategy?
        </p>
        <button
          onClick={() => {
            // Navigate to create page with strategy code for optimization
            // For now, show a placeholder
            alert("Optimizer will be available in the Create page. Fork this strategy to optimize.");
          }}
          className="px-6 py-2.5 bg-bs-purple text-white font-semibold rounded-lg hover:bg-bs-purple-dark transition-colors"
        >
          🔬 Open Optimizer
        </button>
      </div>
    </div>
  );
}

// ─── Code Tab ──────────────────────────────────────────────────
function CodeTab({
  code,
  strategy,
}: {
  code: string;
  strategy: Strategy;
}) {
  return (
    <div className="space-y-6">
      {/* Code View */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Strategy Code</h3>
          {strategy.currentVersion && (
            <span className="text-xs text-bs-muted px-2 py-0.5 bg-bs-border rounded">
              {strategy.currentVersion.version}
            </span>
          )}
        </div>
        {/* Mobile: pre block */}
        <div className="block md:hidden">
          <pre className="bg-[#1e1e2e] text-[#d4d4d4] text-xs p-4 rounded-xl overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre font-mono border border-bs-border">
            <code>{code}</code>
          </pre>
        </div>
        {/* Desktop: Monaco */}
        <div className="hidden md:block rounded-xl overflow-hidden border border-bs-border">
          <MonacoEditor
            height="400px"
            language="python"
            theme="vs-dark"
            value={code}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 12 },
              automaticLayout: true,
            }}
          />
        </div>
      </div>

      {/* Version History */}
      {strategy.versions && strategy.versions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Version History</h3>
          <div className="space-y-2">
            {strategy.versions.map((v) => (
              <div
                key={v.id}
                className={`bg-bs-card border rounded-lg p-4 ${
                  v.id === strategy.currentVersionId
                    ? "border-bs-purple"
                    : "border-bs-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{v.version}</span>
                    {v.id === strategy.currentVersionId && (
                      <span className="ml-2 text-xs text-bs-purple">(current)</span>
                    )}
                  </div>
                  <span className="text-xs text-bs-muted">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {v.changelog && (
                  <p className="text-sm text-bs-muted mt-1">{v.changelog}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Components ────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "green" | "red" | "neutral";
}) {
  const colorClass =
    color === "green"
      ? "text-bs-green"
      : color === "red"
      ? "text-bs-red"
      : "text-foreground";

  return (
    <div className="bg-bs-card border border-bs-border rounded-xl p-4">
      <p className="text-bs-muted text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function formatTime(t: string): string {
  if (!t) return "—";
  try {
    return new Date(t).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return t;
  }
}
