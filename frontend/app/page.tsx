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

type SortKey = "sharpe" | "return" | "created";

export default function HomePage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("sharpe");

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
    // Fallback if no symbols loaded
    if (tabs.length === 1) {
      tabs.push("WOKB", "XETH", "XBTC", "XSOL");
    }
    return tabs;
  }, [symbols]);

  const filtered = useMemo(() => {
    let list = strategies.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.description || "").toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedSymbol !== "All") {
        const config = getBestConfig(s);
        if (config) {
          return config.symbol.startsWith(selectedSymbol);
        }
        // Fallback: check if strategy has any mention
        return true;
      }
      return true;
    });

    // Sort
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
      // created
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [strategies, search, selectedSymbol, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3">
          🐿️ Black Squirrel
        </h1>
        <p className="text-bs-muted text-lg">
          The Strategy Layer for Agentic Trading on XLayer
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search strategies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 bg-bs-input border border-bs-border rounded-lg text-foreground placeholder:text-bs-muted focus:outline-none focus:border-bs-purple transition-colors"
        />
      </div>

      {/* Symbol Tabs + Sort */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <div className="flex items-center gap-2">
          <span className="text-xs text-bs-muted">Sort:</span>
          {(["sharpe", "return", "created"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                sortBy === key
                  ? "bg-bs-purple/20 text-bs-purple"
                  : "text-bs-muted hover:text-white"
              }`}
            >
              {key === "sharpe" ? "Sharpe" : key === "return" ? "Return" : "Newest"}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bs-skeleton h-48 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-20">
          <p className="text-bs-red mb-2">Failed to load strategies</p>
          <p className="text-bs-muted text-sm">{error}</p>
        </div>
      )}

      {/* Strategy Grid */}
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
}: {
  strategy: Strategy;
  onClick: () => void;
}) {
  const config = getBestConfig(strategy);
  const bt = strategy.backtest;
  const perf = strategy.performance;

  const totalReturn = config?.totalReturn ?? bt?.totalReturn ?? perf?.totalReturn ?? 0;
  const sharpeRatio = config?.sharpeRatio ?? bt?.sharpeRatio ?? perf?.sharpeRatio;
  const maxDrawdown = config?.maxDrawdown ?? perf?.maxDrawdown;
  const winRate = config?.winRate ?? bt?.winRate ?? perf?.winRate;
  const isPositive = totalReturn >= 0;
  const authorName = getAuthorName(strategy);

  return (
    <div
      onClick={onClick}
      className="bg-bs-card border border-bs-border rounded-xl p-5 cursor-pointer hover:border-bs-purple/50 hover:bg-bs-card-hover transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1 mr-3">
          <h3 className="font-semibold text-lg group-hover:text-bs-purple transition-colors truncate">
            {strategy.name}
          </h3>
          <p className="text-bs-muted text-sm">by {authorName}</p>
        </div>
        <span
          className={`text-lg font-bold flex-shrink-0 ${
            isPositive ? "text-bs-green" : "text-bs-red"
          }`}
        >
          {isPositive ? "+" : ""}
          {totalReturn.toFixed(1)}%
        </span>
      </div>

      {/* Symbol + Timeframe from config */}
      {config && (
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 text-xs rounded bg-bs-purple/20 text-bs-purple font-medium">
            {config.symbol.split("/")[0]}
          </span>
          <span className="px-2 py-0.5 text-xs rounded bg-bs-border text-bs-muted">
            {config.timeframe}
          </span>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div className="flex justify-between">
          <span className="text-bs-muted">Sharpe</span>
          <span className="font-medium">{sharpeRatio?.toFixed(2) ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-bs-muted">Win Rate</span>
          <span className="font-medium">
            {winRate != null ? `${winRate.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-bs-muted">MaxDD</span>
          <span className={`font-medium ${maxDrawdown && maxDrawdown < -10 ? "text-bs-red" : ""}`}>
            {maxDrawdown != null ? `${maxDrawdown.toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-bs-muted">Trades</span>
          <span className="font-medium">{config?.totalTrades ?? perf?.totalTrades ?? "—"}</span>
        </div>
      </div>

      {/* Robustness + Tags */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(strategy.tags || []).slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-bs-border text-bs-muted"
            >
              {tag}
            </span>
          ))}
        </div>
        {strategy.robustnessScore != null && strategy.robustnessScore > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-bs-green/10 text-bs-green font-medium">
            R: {strategy.robustnessScore.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}
