const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";
const ENGINE_BASE = process.env.NEXT_PUBLIC_ENGINE_BASE || "http://localhost:3200";

// ─── Token Management ──────────────────────────────────────────
const TOKEN_KEY = "bs_auth_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

// ─── Types ─────────────────────────────────────────────────────
export interface User {
  id: string;
  walletAddress: string;
  displayName?: string;
  avatar?: string;
  email?: string;
  createdAt?: string;
}

export interface StrategyVersion {
  id: string;
  strategyId: string;
  version: string;
  code: string;
  paramSchema?: Record<string, ParamDef>;
  changelog?: string;
  createdAt: string;
}

export interface Configuration {
  id: string;
  versionId: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  params: Record<string, number>;
  totalReturn?: number;
  maxDrawdown?: number;
  sharpeRatio?: number;
  winRate?: number;
  totalTrades?: number;
  equityCurve?: number[];
  inSampleSharpe?: number;
  outSampleSharpe?: number;
  paramSensitivity?: number;
  isOptimal?: boolean;
  isPublished?: boolean;
  createdAt?: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  author: string | { id: string; walletAddress: string; displayName?: string };
  authorId?: string;
  version: string;
  tags: string[];
  code: string;
  forkFromId?: string;
  createdAt: string;
  updatedAt: string;
  authorName?: string;
  robustnessScore?: number;
  currentVersionId?: string;
  currentVersion?: StrategyVersion;
  versions?: StrategyVersion[];
  configurations?: Configuration[];
  performance?: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    symbol?: string;
    timeframe?: string;
  } | null;
  backtest?: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  } | null;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  address?: string;
  available: boolean;
}

export interface SymbolsResponse {
  symbols: SymbolInfo[];
  timeframes: string[];
  defaultSymbol: string;
  defaultTimeframe: string;
}

export interface ParamDef {
  type: string;
  default: number;
  inCode?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export interface OptimizeResult {
  bestParams: Record<string, number>;
  inSample: Record<string, number>;
  outSample: Record<string, number>;
  paramSensitivity: Record<string, number>;
  overfittingWarning: boolean;
  allResults: Array<{
    params: Record<string, number>;
    sharpe: number;
    return: number;
    drawdown: number;
    winRate: number;
    trades: number;
    profitFactor: number;
    compositeScore: number;
  }>;
  totalRuns: number;
  elapsedSeconds: number;
}

export interface ScanResult {
  results: Array<{
    symbol: string;
    timeframe: string;
    bestParams: Record<string, number>;
    sharpe?: number;
    totalReturn?: number;
    maxDrawdown?: number;
    winRate?: number;
  }>;
  robustnessScore: number;
  totalRuns: number;
  bestOverall: Record<string, number>;
}

export interface BacktestResult {
  strategy_id: string;
  symbol: string;
  timeframe: string;
  metrics: {
    total_return: number;
    max_drawdown: number;
    sharpe_ratio: number;
    win_rate: number;
    total_trades: number;
    profit_factor?: number;
  };
  equity_curve: { timestamp: string; equity: number }[];
  trades: {
    entry_time: string;
    exit_time: string;
    side: string;
    entry_price: number;
    exit_price: number;
    pnl: number;
    pnl_pct: number;
  }[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Auth API ──────────────────────────────────────────────────
export async function getChallenge(walletAddress: string): Promise<{ nonce: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) throw new Error("Failed to get challenge");
  return res.json();
}

export async function verifySignature(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, signature, nonce }),
  });
  if (!res.ok) throw new Error("Failed to verify signature");
  return res.json();
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Not authenticated");
  const data = await res.json();
  return data.user || data;
}

// ─── Symbols API ───────────────────────────────────────────────
export async function fetchSymbols(): Promise<SymbolsResponse> {
  const res = await fetch(`${API_BASE}/api/symbols`);
  if (!res.ok) {
    // Fallback: return hardcoded XLayer symbols
    return {
      symbols: [
        { symbol: "WOKB/USDT", name: "WOKB", address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b", available: true },
        { symbol: "XETH/USDT", name: "XETH", address: "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", available: true },
        { symbol: "XBTC/USDT", name: "XBTC", address: "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", available: true },
        { symbol: "XSOL/USDT", name: "XSOL", address: "0x505000008de8748dbd4422ff4687a4fc9beba15b", available: true },
      ],
      timeframes: ["1h", "4h", "1d"],
      defaultSymbol: "WOKB/USDT",
      defaultTimeframe: "1h",
    };
  }
  return res.json();
}

// ─── Strategies API ────────────────────────────────────────────
export async function fetchStrategies(): Promise<Strategy[]> {
  const res = await fetch(`${API_BASE}/api/strategies`);
  if (!res.ok) throw new Error("Failed to fetch strategies");
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.strategies)) return data.strategies;
  return [];
}

export async function fetchStrategy(id: string): Promise<Strategy> {
  const res = await fetch(`${API_BASE}/api/strategies/${id}`);
  if (!res.ok) throw new Error("Failed to fetch strategy");
  const data = await res.json();
  return data.strategy || data;
}

export async function fetchBacktest(id: string): Promise<BacktestResult | null> {
  const res = await fetch(`${API_BASE}/api/strategies/${id}/backtest`);
  if (!res.ok) return null;
  const raw = await res.json();
  const data = Array.isArray(raw) ? raw[0] : (raw.backtest || raw);
  if (!data) return null;
  if (!data.metrics && data.totalReturn !== undefined) {
    return normalizeBacktest(data, id);
  }
  return data;
}

export async function runBacktest(
  id: string,
  symbol: string,
  timeframe: string
): Promise<BacktestResult> {
  const res = await fetch(`${API_BASE}/api/strategies/${id}/backtest/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ symbol, timeframe }),
  });
  if (!res.ok) throw new Error("Failed to run backtest");
  const raw = await res.json();
  const data = raw.backtest || raw;
  if (!data.metrics && data.totalReturn !== undefined) {
    return normalizeBacktest(data, id, symbol, timeframe);
  }
  return data;
}

export async function forkStrategy(id: string, code: string): Promise<Strategy> {
  const res = await fetch(`${API_BASE}/api/strategies/${id}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("Failed to fork strategy");
  const data = await res.json();
  return data.strategy || data;
}

// ─── Engine API ────────────────────────────────────────────────
export async function runEngineBacktest(
  code: string,
  symbol: string,
  timeframe: string
): Promise<BacktestResult> {
  const res = await fetch(`${ENGINE_BASE}/engine/backtest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, symbol, timeframe }),
  });
  if (!res.ok) throw new Error("Failed to run engine backtest");
  const data = await res.json();
  if (!data.metrics && data.totalReturn !== undefined) {
    return normalizeBacktest(data, "", symbol, timeframe);
  }
  return data;
}

export async function extractParams(code: string): Promise<Record<string, ParamDef>> {
  const res = await fetch(`${ENGINE_BASE}/engine/extract-params`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("Failed to extract parameters");
  const data = await res.json();
  return data.params || {};
}

export async function runOptimize(opts: {
  code: string;
  symbol: string;
  timeframe: string;
  paramRanges: Record<string, { min: number; max: number; step: number }>;
  optimizeTarget?: string;
  inSampleRatio?: number;
  weights?: Record<string, number>;
}): Promise<OptimizeResult> {
  const body: Record<string, unknown> = {
    code: opts.code,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    paramRanges: opts.paramRanges,
    optimizeTarget: opts.optimizeTarget || "sharpe",
    inSampleRatio: opts.inSampleRatio || 0.7,
  };
  if (opts.weights) {
    body.weights = opts.weights;
  }
  const res = await fetch(`${ENGINE_BASE}/engine/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Optimization failed");
  return res.json();
}

export async function runScan(opts: {
  code: string;
  symbols: string[];
  timeframes: string[];
  paramRanges: Record<string, { min: number; max: number; step: number }>;
  optimizeTarget?: string;
}): Promise<ScanResult> {
  const res = await fetch(`${ENGINE_BASE}/engine/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error("Scan failed");
  return res.json();
}

// ─── AI API ────────────────────────────────────────────────────
export async function generateStrategy(prompt: string): Promise<{ code: string; explanation: string }> {
  const res = await fetch(`${API_BASE}/api/ai/generate-strategy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error("Failed to generate strategy");
  return res.json();
}

export async function improveStrategy(
  code: string,
  feedback: string
): Promise<{ code: string; explanation: string }> {
  const res = await fetch(`${API_BASE}/api/ai/improve-strategy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, feedback }),
  });
  if (!res.ok) throw new Error("Failed to improve strategy");
  return res.json();
}

export async function publishStrategy(strategy: {
  name: string;
  description: string;
  code: string;
  tags: string[];
}): Promise<Strategy> {
  const res = await fetch(`${API_BASE}/api/strategies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(strategy),
  });
  if (!res.ok) throw new Error("Failed to publish strategy");
  const data = await res.json();
  return data.strategy || data;
}

// ─── Helpers ───────────────────────────────────────────────────
function normalizeBacktest(
  data: Record<string, unknown>,
  strategyId: string,
  symbol?: string,
  timeframe?: string
): BacktestResult {
  return {
    strategy_id: (data.strategyId as string) || strategyId,
    symbol: (data.symbol as string) || symbol || "",
    timeframe: (data.timeframe as string) || timeframe || "",
    metrics: {
      total_return: data.totalReturn as number,
      max_drawdown: data.maxDrawdown as number,
      sharpe_ratio: data.sharpeRatio as number,
      win_rate: data.winRate as number,
      total_trades: data.totalTrades as number,
    },
    equity_curve: ((data.equityCurve as unknown[]) || []).map((v: unknown, i: number) => {
      if (typeof v === "number") return { timestamp: String(i), equity: v };
      const obj = v as Record<string, unknown>;
      return {
        timestamp: (obj.date as string) || (obj.timestamp as string) || String(i),
        equity: (obj.equity as number) ?? (v as number),
      };
    }),
    trades: (data.trades as BacktestResult["trades"]) || [],
  };
}

export function getAuthorName(strategy: Strategy): string {
  if (typeof strategy.author === "object" && strategy.author) {
    if (strategy.author.displayName) return strategy.author.displayName;
    return truncateAddress(strategy.author.walletAddress);
  }
  if (strategy.authorName) return strategy.authorName;
  const a = strategy.author as string;
  if (a && a.startsWith("0x") && a.length > 16) return truncateAddress(a);
  return a || "Anonymous";
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function getBestConfig(strategy: Strategy): Configuration | null {
  if (!strategy.configurations || strategy.configurations.length === 0) return null;
  // prefer isOptimal first, then highest sharpe
  const optimal = strategy.configurations.find((c) => c.isOptimal);
  if (optimal) return optimal;
  return strategy.configurations.reduce((best, c) => {
    if ((c.sharpeRatio ?? -999) > (best.sharpeRatio ?? -999)) return c;
    return best;
  }, strategy.configurations[0]);
}
