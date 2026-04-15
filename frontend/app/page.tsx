"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  fetchStrategies,
  fetchSymbols,
  Strategy,
  SymbolInfo,
  getAuthorName,
  getBestConfig,
} from "@/lib/api";

type SortKey = "sharpe" | "return" | "robustness" | "created";
type FilterMode = "all" | "robust" | "highSharpe" | "recent";

export default function HomePage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("robustness");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  useEffect(() => {
    Promise.all([fetchStrategies(), fetchSymbols()])
      .then(([strats, symData]) => {
        setStrategies(strats);
        setSymbols(symData.symbols || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const symbolTabs = useMemo(() => {
    const tabs = ["All"];
    symbols.forEach((s) => {
      const short = s.symbol.split("/")[0];
      if (!tabs.includes(short)) tabs.push(short);
    });
    if (tabs.length === 1) {
      tabs.push("WOKB", "XETH", "XBTC", "XSOL");
    }
    return tabs;
  }, [symbols]);

  const marketStats = useMemo(() => {
    const withRobustness = strategies.filter((s) => (s.robustnessScore ?? 0) > 0);
    const avgRobustness = withRobustness.length > 0
      ? withRobustness.reduce((sum, s) => sum + (s.robustnessScore ?? 0), 0) / withRobustness.length
      : 0;
    const highSharpeCount = strategies.filter((s) => {
      const cfg = getBestConfig(s);
      const sharpe = cfg?.sharpeRatio ?? s.backtest?.sharpeRatio ?? s.performance?.sharpeRatio ?? -999;
      return sharpe >= 1.5;
    }).length;
    return {
      total: strategies.length,
      robust: withRobustness.length,
      avgRobustness,
      highSharpeCount,
    };
  }, [strategies]);

  const filtered = useMemo(() => {
    let list = strategies.filter((s) => {
      const haystack = [s.name, s.description || "", ...(s.tags || [])].join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedSymbol !== "All") {
        const config = getBestConfig(s);
        if (config?.symbol) {
          if (!config.symbol.startsWith(selectedSymbol)) return false;
        }
      }

      const config = getBestConfig(s);
      const sharpe = config?.sharpeRatio ?? s.backtest?.sharpeRatio ?? s.performance?.sharpeRatio ?? -999;
      const robustness = s.robustnessScore ?? 0;
      const createdAt = new Date(s.createdAt).getTime();
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

      if (filterMode === "robust" && robustness < 60) return false;
      if (filterMode === "highSharpe" && sharpe < 1.5) return false;
      if (filterMode === "recent" && createdAt < threeDaysAgo) return false;

      return true;
    });

    list = [...list].sort((a, b) => {
      const ca = getBestConfig(a);
      const cb = getBestConfig(b);
      const pa = a.performance;
      const pb = b.performance;
      const ba = a.backtest;
      const bb = b.backtest;

      if (sortBy === "sharpe") {
        const sa = ca?.sharpeRatio ?? ba?.sharpeRatio ?? pa?.sharpeRatio ?? -999;
        const sb = cb?.sharpeRatio ?? bb?.sharpeRatio ?? pb?.sharpeRatio ?? -999;
        return sb - sa;
      }
      if (sortBy === "return") {
        const ra = ca?.totalReturn ?? ba?.totalReturn ?? pa?.totalReturn ?? -999;
        const rb = cb?.totalReturn ?? bb?.totalReturn ?? pb?.totalReturn ?? -999;
        return rb - ra;
      }
      if (sortBy === "robustness") {
        return (b.robustnessScore ?? -999) - (a.robustnessScore ?? -999);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [strategies, search, selectedSymbol, sortBy, filterMode]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3">Neonex</h1>
        <p className="text-bs-muted text-lg">The Strategy Layer for Agentic Trading on XLayer</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MarketStatCard label="Strategies" value={String(marketStats.total)} />
        <MarketStatCard label="Robust Setups" value={String(marketStats.robust)} tone="green" />
        <MarketStatCard label="Avg Robustness" value={marketStats.avgRobustness > 0 ? marketStats.avgRobustness.toFixed(0) : "—"} tone="purple" />
        <MarketStatCard label="Sharpe ≥ 1.5" value={String(marketStats.highSharpeCount)} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto] gap-3 items-start">
        <input
          type="text"
          placeholder="Search strategies, tags, descriptions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 bg-bs-input border border-bs-border rounded-lg text-foreground placeholder:text-bs-muted focus:outline-none focus:border-bs-purple transition-colors"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { key: "all" as const, label: "All" },
            { key: "robust" as const, label: "Robust" },
            { key: "highSharpe" as const, label: "High Sharpe" },
            { key: "recent" as const, label: "Recent" },
          ]).map((filter) => (
            <button
              key={filter.key}
              onClick={() => setFilterMode(filter.key)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                filterMode === filter.key
                  ? "bg-bs-purple/20 border-bs-purple text-bs-purple"
                  : "bg-bs-card border-bs-border text-bs-muted hover:border-bs-purple/50 hover:text-white"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {symbolTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedSymbol(tab)}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                selectedSymbol === tab
                  ? "bg-bs-purple text-white"
                  : "bg-bs-card border border-bs-border text-bs-muted hover:border-bs-purple/50 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="text-xs text-bs-muted">
            Showing <span className="text-white font-semibold">{filtered.length}</span> of {strategies.length}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-bs-muted">Sort:</span>
            {([
              ["robustness", "Robustness"],
              ["sharpe", "Sharpe"],
              ["return", "Return"],
              ["created", "Newest"],
            ] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  sortBy === key
                    ? "bg-bs-purple/20 text-bs-purple"
                    : "text-bs-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bs-skeleton h-56 rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-20">
          <p className="text-bs-red mb-2">Failed to load strategies</p>
          <p className="text-bs-muted text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-bs-muted">
              <p className="text-xl mb-2">No strategies found</p>
              <p className="text-sm">
                Be the first to{" "}
                <button
                  onClick={() => router.push("/create")}
                  className="text-bs-purple hover:underline"
                >
                  create one
                </button>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  onClick={() => router.push(`/strategy/${strategy.id}`)}
                  onAuthorClick={(authorId) => router.push(`/author/${authorId}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StrategyCard({
  strategy,
  onClick,
  onAuthorClick,
}: {
  strategy: Strategy;
  onClick: () => void;
  onAuthorClick: (authorId: string) => void;
}) {
  const config = getBestConfig(strategy);
  const bt = strategy.backtest;
  const perf = strategy.performance;

  const totalReturn = config?.totalReturn ?? bt?.totalReturn ?? perf?.totalReturn ?? 0;
  const sharpeRatio = config?.sharpeRatio ?? bt?.sharpeRatio ?? perf?.sharpeRatio;
  const maxDrawdown = config?.maxDrawdown ?? perf?.maxDrawdown;
  const winRate = config?.winRate ?? bt?.winRate ?? perf?.winRate;
  const totalTrades = config?.totalTrades ?? perf?.totalTrades;
  const isPositive = totalReturn >= 0;
  const authorName = getAuthorName(strategy);
  const robustness = strategy.robustnessScore ?? 0;
  const createdLabel = new Date(strategy.createdAt).toLocaleDateString();

  return (
    <div
      onClick={onClick}
      className="bg-bs-card border border-bs-border rounded-xl p-5 cursor-pointer hover:border-bs-purple/50 hover:bg-bs-card-hover transition-all group"
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg group-hover:text-bs-purple transition-colors truncate">
            {strategy.name}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const authorId = typeof strategy.author === "object" ? strategy.author?.id || strategy.author?.walletAddress : strategy.author;
              if (authorId) onAuthorClick(authorId);
            }}
            className="text-bs-muted text-sm truncate hover:text-white transition-colors"
          >
            by {authorName}
          </button>
        </div>
        <span className={`text-lg font-bold flex-shrink-0 ${isPositive ? "text-bs-green" : "text-bs-red"}`}>
          {isPositive ? "+" : ""}
          {totalReturn.toFixed(1)}%
        </span>
      </div>

      <p className="text-sm text-bs-muted line-clamp-2 min-h-[2.5rem] mb-3">
        {strategy.description || "No description yet."}
      </p>

      <div className="flex items-center flex-wrap gap-2 mb-3">
        {config && (
          <>
            <span className="px-2 py-0.5 text-xs rounded bg-bs-purple/20 text-bs-purple font-medium">
              {config.symbol.split("/")[0]}
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-bs-border text-bs-muted">
              {config.timeframe}
            </span>
          </>
        )}
        {robustness > 0 && (
          <span className="px-2 py-0.5 text-xs rounded bg-bs-green/10 text-bs-green font-medium">
            Robustness {robustness.toFixed(0)}
          </span>
        )}
        <span className="px-2 py-0.5 text-xs rounded bg-bs-border text-bs-muted">
          {createdLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4">
        <Metric label="Sharpe" value={sharpeRatio?.toFixed(2) ?? "—"} />
        <Metric label="Win Rate" value={winRate != null ? `${winRate.toFixed(0)}%` : "—"} />
        <Metric label="MaxDD" value={maxDrawdown != null ? `${maxDrawdown.toFixed(1)}%` : "—"} highlight={maxDrawdown != null && maxDrawdown < -10 ? "red" : undefined} />
        <Metric label="Trades" value={totalTrades != null ? String(totalTrades) : "—"} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {(strategy.tags || []).slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-bs-border text-bs-muted"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="text-xs text-bs-muted group-hover:text-white transition-colors whitespace-nowrap">
          View →
        </span>
      </div>
    </div>
  );
}

function MarketStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "purple";
}) {
  const color = tone === "green" ? "text-bs-green" : tone === "purple" ? "text-bs-purple" : "text-white";
  return (
    <div className="bg-bs-card border border-bs-border rounded-xl p-4">
      <p className="text-bs-muted text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "red";
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-bs-muted">{label}</span>
      <span className={`font-medium ${highlight === "red" ? "text-bs-red" : ""}`}>{value}</span>
    </div>
  );
}
