"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  generateStrategy,
  improveStrategy,
  runEngineBacktest,
  publishStrategy,
  extractParams,
  fetchSymbols,
  BacktestResult,
  ChatMessage,
  ParamDef,
  SymbolInfo,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-bs-input rounded-lg animate-pulse" />
  ),
});

const EquityChart = dynamic(() => import("@/components/EquityChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[250px] bs-skeleton rounded-lg" />
  ),
});

const OptimizerPanel = dynamic(() => import("@/components/OptimizerPanel"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] bs-skeleton rounded-lg" />
  ),
});

export default function CreateStrategyPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your AI strategy assistant 🐿️\n\nDescribe your trading strategy idea and I'll generate the Python code for you.\n\nFor example: \"Create a momentum strategy using RSI and MACD crossover for WOKB\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Symbols & Timeframes
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>(["1h", "4h", "1d"]);
  const [symbol, setSymbol] = useState("WOKB/USDT");
  const [timeframe, setTimeframe] = useState("1h");

  // Backtest
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  // Params & Optimizer
  const [extractedParams, setExtractedParams] = useState<Record<string, ParamDef>>({});
  const [showOptimizer, setShowOptimizer] = useState(false);

  // Publish
  const [publishName, setPublishName] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "code">("chat");

  // Load symbols on mount
  useEffect(() => {
    fetchSymbols().then((data) => {
      setSymbols(data.symbols || []);
      setTimeframes(data.timeframes || ["1h", "4h", "1d"]);
      if (data.defaultSymbol) setSymbol(data.defaultSymbol);
      if (data.defaultTimeframe) setTimeframe(data.defaultTimeframe);
    }).catch(() => {
      // Use defaults
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-extract params after AI generates code
  const handleExtractParams = useCallback(async (newCode: string) => {
    try {
      const params = await extractParams(newCode);
      setExtractedParams(params);
    } catch {
      // silently fail — params extraction is optional
    }
  }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || aiLoading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setAiLoading(true);

    try {
      const isFirstCode = code === DEFAULT_CODE || !code.trim();
      const result = isFirstCode
        ? await generateStrategy(msg)
        : await improveStrategy(code, msg);

      if (result.code) {
        setCode(result.code);
        // Auto-extract parameters
        handleExtractParams(result.code);
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.explanation || "Strategy updated! Check the editor →",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "AI request failed";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${errMsg}` },
      ]);
    } finally {
      setAiLoading(false);
    }
  }, [input, aiLoading, code, handleExtractParams]);

  const handleBacktest = useCallback(async () => {
    setBacktesting(true);
    setBacktestResult(null);
    try {
      const result = await runEngineBacktest(code, symbol, timeframe);
      setBacktestResult(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Backtest failed";
      alert(msg);
    } finally {
      setBacktesting(false);
    }
  }, [code, symbol, timeframe]);

  const handlePublish = useCallback(async () => {
    if (!publishName.trim()) return;
    if (!isLoggedIn) {
      alert("Please connect your wallet to publish.");
      return;
    }
    setPublishing(true);
    try {
      const s = await publishStrategy({
        name: publishName,
        description: publishDesc,
        code,
        tags: publishTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setShowPublishModal(false);
      router.push(`/strategy/${s.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Publish failed";
      alert(msg);
    } finally {
      setPublishing(false);
    }
  }, [publishName, publishDesc, publishTags, code, router, isLoggedIn]);

  const handleApplyParams = useCallback((params: Record<string, number>) => {
    // Replace parameter defaults in code
    let newCode = code;
    Object.entries(params).forEach(([key, val]) => {
      // Match pattern: key = <number>
      const regex = new RegExp(`(${key}\\s*=\\s*)([\\d.]+)`, "g");
      newCode = newCode.replace(regex, `$1${val}`);
    });
    setCode(newCode);
    setShowOptimizer(false);
  }, [code]);

  const metrics = backtestResult?.metrics;
  const symbolList = symbols.length > 0
    ? symbols.filter((s) => s.available).map((s) => s.symbol)
    : ["WOKB/USDT", "XETH/USDT", "XBTC/USDT", "XSOL/USDT"];

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex border-b border-bs-border bg-bs-card">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "chat"
              ? "text-bs-purple border-b-2 border-bs-purple"
              : "text-bs-muted"
          }`}
        >
          🤖 AI Chat
        </button>
        <button
          onClick={() => setActiveTab("code")}
          className={`flex-1 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "code"
              ? "text-bs-purple border-b-2 border-bs-purple"
              : "text-bs-muted"
          }`}
        >
          📝 Code
        </button>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Left: AI Chat */}
        <div
          className={`w-full md:w-[380px] md:min-w-[380px] border-r border-bs-border flex flex-col bg-bs-card md:max-h-none min-h-0 flex-1 md:flex-none ${
            activeTab !== "chat" ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="px-4 py-3 border-b border-bs-border font-semibold text-sm hidden md:block">
            🤖 AI Strategy Assistant
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-bs-purple/20 text-bs-purple"
                      : "bg-bs-input text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="bg-bs-input px-4 py-3 rounded-xl">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-bs-muted rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-bs-muted rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-bs-muted rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-bs-border shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Describe your strategy..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && handleSend()
                }
                disabled={aiLoading}
                className="flex-1 px-3 py-2 bg-bs-input border border-bs-border rounded-lg text-sm placeholder:text-bs-muted focus:outline-none focus:border-bs-purple disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={aiLoading || !input.trim()}
                className="px-3 py-2 bg-bs-purple text-white text-sm font-semibold rounded-lg hover:bg-bs-purple-dark transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Right: Editor + Results */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            activeTab !== "code" ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Editor */}
          <div className="flex-1 min-h-0">
            <MonacoEditor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v || "")}
              options={{
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

          {/* Optimizer Panel (overlay) */}
          {showOptimizer && (
            <div className="border-t border-bs-border max-h-[60vh] overflow-y-auto">
              <OptimizerPanel
                code={code}
                params={extractedParams}
                symbols={symbols.length > 0 ? symbols : [
                  { symbol: "WOKB/USDT", name: "WOKB", available: true },
                  { symbol: "XETH/USDT", name: "XETH", available: true },
                  { symbol: "XBTC/USDT", name: "XBTC", available: true },
                  { symbol: "XSOL/USDT", name: "XSOL", available: true },
                ]}
                timeframes={timeframes}
                onApplyParams={handleApplyParams}
                onClose={() => setShowOptimizer(false)}
              />
            </div>
          )}

          {/* Backtest Results */}
          {backtestResult && !showOptimizer && (
            <div className="border-t border-bs-border max-h-[40vh] overflow-y-auto">
              {metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-3">
                  <MiniMetric
                    label="Return"
                    value={`${metrics.total_return >= 0 ? "+" : ""}${metrics.total_return.toFixed(2)}%`}
                    positive={metrics.total_return >= 0}
                  />
                  <MiniMetric
                    label="Drawdown"
                    value={`${metrics.max_drawdown.toFixed(2)}%`}
                    positive={false}
                  />
                  <MiniMetric
                    label="Sharpe"
                    value={metrics.sharpe_ratio.toFixed(2)}
                    positive={metrics.sharpe_ratio >= 1}
                  />
                  <MiniMetric
                    label="Win Rate"
                    value={`${metrics.win_rate.toFixed(1)}%`}
                    positive={metrics.win_rate >= 50}
                  />
                  <MiniMetric
                    label="Trades"
                    value={String(metrics.total_trades)}
                    positive={true}
                  />
                </div>
              )}
              {backtestResult.equity_curve &&
                backtestResult.equity_curve.length > 0 && (
                  <div className="px-3 pb-3">
                    <EquityChart data={backtestResult.equity_curve} />
                  </div>
                )}
            </div>
          )}

          {/* Toolbar */}
          <div className="border-t border-bs-border bg-bs-card px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="px-3 py-1.5 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple"
              >
                {symbolList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="px-3 py-1.5 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple"
              >
                {timeframes.map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
              <button
                onClick={handleBacktest}
                disabled={backtesting}
                className="px-4 py-1.5 bg-bs-purple text-white text-sm font-semibold rounded-lg hover:bg-bs-purple-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {backtesting && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {backtesting ? "Running..." : "▶ Backtest"}
              </button>
              <button
                onClick={() => {
                  if (Object.keys(extractedParams).length === 0) {
                    // Try extracting first
                    handleExtractParams(code).then(() => setShowOptimizer(true));
                  } else {
                    setShowOptimizer(!showOptimizer);
                  }
                }}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                  showOptimizer
                    ? "bg-bs-purple/20 text-bs-purple border border-bs-purple"
                    : "border border-bs-border text-bs-muted hover:border-bs-purple hover:text-bs-purple"
                }`}
              >
                🔬 Optimize
              </button>
            </div>
            <button
              onClick={() => setShowPublishModal(true)}
              className="px-5 py-1.5 bg-bs-green text-black text-sm font-semibold rounded-lg hover:bg-bs-green-dark transition-colors"
            >
              📦 Publish
            </button>
          </div>
        </div>
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bs-card border border-bs-border rounded-xl w-full max-w-md p-6 space-y-4 mx-4">
            <h3 className="text-lg font-semibold">Publish Strategy</h3>
            {!isLoggedIn && (
              <div className="px-3 py-2 bg-bs-red/10 border border-bs-red/30 rounded-lg text-sm text-bs-red">
                ⚠️ Connect your wallet first to publish
              </div>
            )}
            <div>
              <label className="block text-sm text-bs-muted mb-1">Name *</label>
              <input
                type="text"
                value={publishName}
                onChange={(e) => setPublishName(e.target.value)}
                placeholder="My Awesome Strategy"
                className="w-full px-3 py-2 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple"
              />
            </div>
            <div>
              <label className="block text-sm text-bs-muted mb-1">Description</label>
              <textarea
                value={publishDesc}
                onChange={(e) => setPublishDesc(e.target.value)}
                placeholder="Describe your strategy..."
                rows={3}
                className="w-full px-3 py-2 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-bs-muted mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={publishTags}
                onChange={(e) => setPublishTags(e.target.value)}
                placeholder="momentum, trend, rsi"
                className="w-full px-3 py-2 bg-bs-input border border-bs-border rounded-lg text-sm focus:outline-none focus:border-bs-purple"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 text-sm text-bs-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || !publishName.trim() || !isLoggedIn}
                className="px-5 py-2 bg-bs-green text-black text-sm font-semibold rounded-lg hover:bg-bs-green-dark transition-colors disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="bg-bs-input rounded-lg px-3 py-2 text-center">
      <p className="text-[10px] text-bs-muted uppercase tracking-wide">{label}</p>
      <p
        className={`text-sm font-bold ${
          positive ? "text-bs-green" : "text-bs-red"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const DEFAULT_CODE = `from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd

def SMA(values, n):
    return pd.Series(values).rolling(n).mean().values

class MyStrategy(Strategy):
    """Your strategy here — edit or ask AI to generate one."""
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
`;
