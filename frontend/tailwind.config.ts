import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        foreground: "#e5e5e5",
        "bs-green": "#00ff88",
        "bs-green-dark": "#00cc6a",
        "bs-red": "#ff4444",
        "bs-red-dark": "#cc3333",
        "bs-purple": "#6c5ce7",
        "bs-purple-dark": "#5a4bd6",
        "bs-card": "#12121a",
        "bs-card-hover": "#1a1a2e",
        "bs-border": "#2a2a3e",
        "bs-muted": "#666680",
        "bs-input": "#1e1e2e",
      },
    },
  },
  plugins: [],
};
export default config;
