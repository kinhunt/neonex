# Phase C: Frontend Refactor — CHANGELOG

## Date: 2026-04-03

## Summary
Complete frontend refactor for v3: wallet login, performance-first UI, optimizer interface, XLayer symbols.

---

## 1. API Layer (`lib/api.ts`) ✅
- Added v3 types: `User`, `StrategyVersion`, `Configuration`, `OptimizeResult`, `ScanResult`, `SymbolInfo`, `ParamDef`
- Added auth functions: `getChallenge()`, `verifySignature()`, `getMe()`
- Added token management: `getToken()`, `setToken()`, `clearToken()` with localStorage
- All authenticated requests auto-attach `Authorization: Bearer <token>` header
- Added `fetchSymbols()` with XLayer fallback (WOKB/XETH/XBTC/XSOL)
- Added optimizer functions: `extractParams()`, `runOptimize()`, `runScan()`
- Updated `Strategy` type for v3 format (author object, versions, configurations)
- Added helpers: `getAuthorName()`, `truncateAddress()`, `getBestConfig()`
- `publishStrategy()` and `forkStrategy()` now include auth headers

## 2. Auth Context (`lib/auth-context.tsx`) ✅
- React Context managing: `user`, `token`, `isLoggedIn`, `isLoading`, `login()`, `logout()`
- `login()` flow: `eth_requestAccounts` → `getChallenge()` → `personal_sign` → `verifySignature()` → store token
- Auto-restores session from localStorage on mount via `/api/auth/me`
- Supports MetaMask and OKX Wallet via `window.ethereum`
- TypeScript declaration for `window.ethereum`

## 3. NavBar Component (`components/NavBar.tsx`) ✅
- Extracted from layout into standalone client component
- Not logged in: "Connect Wallet" green button (with loading spinner)
- Logged in: avatar initial + truncated address + dropdown menu
- Dropdown: user info + "Disconnect" button
- Error toast on connection failure (auto-dismiss 4s)
- Responsive: shows 🔗 icon on mobile, full text on desktop
- Outside-click to close dropdown

## 4. Layout (`app/layout.tsx`) ✅
- Wrapped with `<AuthProvider>`
- Uses new `<NavBar />` component
- "Create" button uses purple theme color

## 5. Homepage (`app/page.tsx`) ✅
- **Symbol filter tabs**: All / WOKB / XETH / XBTC / XSOL (dynamic from API)
- **Sort controls**: Sharpe / Return / Newest
- **Strategy cards** show:
  - Strategy name + author name (from v3 author object)
  - Symbol badge + timeframe (from best configuration)
  - 4 metrics grid: Sharpe, Win Rate, MaxDD, Trades
  - Robustness score badge (if available)
  - Tags
- **Loading state**: 6x skeleton cards with shimmer animation
- Symbols loaded from `/api/symbols` with fallback

## 6. Strategy Detail Page (`app/strategy/[id]/page.tsx`) ✅
- **Performance-first tab layout**:
  - **Tab 1 "Performance"** (default): backtest controls, metric cards, large equity curve, configurations table, trade history
  - **Tab 2 "Parameters"**: param schema display with current/default values, in-sample vs out-sample validation, overfitting warning, optimizer entry button
  - **Tab 3 "Code"**: Monaco (desktop) / pre (mobile), version history list
- Header: strategy name + author + symbol badge + timeframe + robustness score + tags
- Backtest controls use XLayer symbols from API
- Configurations table shows all symbol/timeframe combos with metrics and "★ Best" badge
- Fork requires wallet connection
- Full skeleton loading state

## 7. Create Page (`app/create/page.tsx`) ✅
- No forced symbol selection at start
- Symbols loaded dynamically from `/api/symbols`
- AI chat auto-extracts parameters after code generation
- **Optimize button** in toolbar:
  - Opens `OptimizerPanel` overlay
  - Auto-triggers param extraction if not done
  - Apply best params updates code inline
- Backtest uses XLayer symbols
- Publish requires wallet connection (with warning)
- Purple theme for UI elements

## 8. Optimizer Panel (`components/OptimizerPanel.tsx`) ✅
- **Configuration panel**:
  - Multi-select symbols (toggle buttons)
  - Multi-select timeframes
  - Optimization target selector (Sharpe/Return/Drawdown/WinRate)
  - Per-parameter range inputs (min/max/step)
- **Estimate display**: total backtests count + estimated duration
- **Progress bar** with percentage during optimization
- **Results view**:
  - Summary: total runs, duration, in-sample/out-sample Sharpe
  - Overfitting warning (red alert if out-sample < in-sample × 0.5)
  - Best parameters with "Apply" button
  - Parameter sensitivity bars (color-coded: green/yellow/red)
  - Top 10 results table
  - "Apply Best Parameters" and "Re-configure" actions

## 9. Equity Chart (`components/EquityChart.tsx`) ✅
- Updated colors to new scheme (#00ff88 green, #ff4444 red, #2a2a3e grid)
- Uses `ResponsiveContainer` with 100% height for flexible sizing

## 10. Styling ✅
- **Tailwind config** updated with new color palette:
  - Background: `#0a0a0f` → `#12121a` → `#1a1a2e`
  - Green: `#00ff88`, Red: `#ff4444`, Purple: `#6c5ce7`
  - Border: `#2a2a3e`, Muted: `#666680`, Input: `#1e1e2e`
- **globals.css**: shimmer skeleton animation, updated scrollbar colors
- All components use consistent `bs-` prefixed colors
- Full mobile responsiveness on all pages

## Build Status
```
✓ npm run build — zero errors
✓ All 4 routes compile successfully
✓ TypeScript strict mode
```

---

## Files Modified
- `lib/api.ts` — Complete rewrite with v3 types + auth + optimizer + symbols
- `lib/auth-context.tsx` — NEW: React auth context
- `components/NavBar.tsx` — NEW: Wallet-aware navigation
- `components/OptimizerPanel.tsx` — NEW: Full optimizer UI
- `components/EquityChart.tsx` — Updated colors
- `app/layout.tsx` — AuthProvider + NavBar
- `app/page.tsx` — Symbol tabs + sort + v3 cards
- `app/strategy/[id]/page.tsx` — Performance-first tabs
- `app/create/page.tsx` — Optimizer integration + XLayer symbols
- `app/globals.css` — New colors + skeleton animation
- `tailwind.config.ts` — New color palette
