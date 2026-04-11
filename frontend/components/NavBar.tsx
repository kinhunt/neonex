"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { truncateAddress } from "@/lib/api";

export function NavBar() {
  const { user, isLoggedIn, isLoading, login, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await login();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-bs-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-2 text-lg font-bold hover:text-bs-green transition-colors"
        >
          <span className="hidden sm:inline">🐿️ Black Squirrel</span>
          <span className="sm:hidden">🐿️</span>
        </a>

        <div className="flex items-center gap-3">
          <a
            href="/create"
            className="px-4 py-1.5 bg-bs-purple text-white text-sm font-semibold rounded-lg hover:bg-bs-purple-dark transition-colors"
          >
            <span className="hidden sm:inline">+ Create</span>
            <span className="sm:hidden">+</span>
          </a>

          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-bs-input animate-pulse" />
          ) : isLoggedIn && user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((p) => !p)}
                className="flex items-center gap-2 px-3 py-1.5 bg-bs-card border border-bs-border rounded-lg hover:border-bs-green/50 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-bs-purple flex items-center justify-center text-xs font-bold text-white">
                  {(user.displayName || user.walletAddress || "?")[0].toUpperCase()}
                </div>
                <span className="text-sm font-mono hidden sm:inline">
                  {user.displayName || truncateAddress(user.walletAddress)}
                </span>
                <svg
                  className={`w-3 h-3 text-bs-muted transition-transform ${showMenu ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-bs-card border border-bs-border rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-bs-border">
                    <p className="text-sm font-semibold truncate">
                      {user.displayName || "Anonymous"}
                    </p>
                    <p className="text-xs text-bs-muted font-mono">
                      {truncateAddress(user.walletAddress)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      logout();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-bs-red hover:bg-bs-card-hover transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-4 py-1.5 bg-bs-green text-black text-sm font-semibold rounded-lg hover:bg-bs-green-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {connecting && (
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                )}
                <span className="hidden sm:inline">
                  {connecting ? "Connecting..." : "Connect Wallet"}
                </span>
                <span className="sm:hidden">🔗</span>
              </button>
              {error && (
                <div className="absolute right-0 mt-2 w-64 bg-bs-card border border-bs-red/50 rounded-lg px-3 py-2 text-xs text-bs-red shadow-xl">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
