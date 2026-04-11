"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface EquityPoint {
  timestamp?: string;
  equity?: number;
}

export default function EquityChart({ data }: { data: (EquityPoint | number)[] }) {
  const normalized = data.map((d, i) => {
    if (typeof d === "number") {
      return { equity: d, time: `Day ${i + 1}` };
    }
    const equity = d.equity ?? 0;
    const time =
      d.timestamp && !isNaN(Date.parse(d.timestamp))
        ? formatDate(d.timestamp)
        : `Day ${i + 1}`;
    return { equity, time };
  });

  if (normalized.length === 0) return null;

  const equities = normalized.map((d) => d.equity);
  const minEquity = Math.min(...equities);
  const maxEquity = Math.max(...equities);
  const padding = (maxEquity - minEquity) * 0.05 || 100;

  const isPositive =
    normalized.length > 1 &&
    normalized[normalized.length - 1].equity >= normalized[0].equity;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={normalized}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
        <XAxis
          dataKey="time"
          stroke="#666680"
          tick={{ fill: "#666680", fontSize: 11 }}
          tickLine={{ stroke: "#2a2a3e" }}
        />
        <YAxis
          domain={[minEquity - padding, maxEquity + padding]}
          stroke="#666680"
          tick={{ fill: "#666680", fontSize: 11 }}
          tickLine={{ stroke: "#2a2a3e" }}
          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#12121a",
            border: "1px solid #2a2a3e",
            borderRadius: "8px",
            color: "#e5e5e5",
            fontSize: 12,
          }}
          formatter={(value: number) => [
            `$${value.toLocaleString()}`,
            "Equity",
          ]}
          labelStyle={{ color: "#666680" }}
        />
        <Line
          type="monotone"
          dataKey="equity"
          stroke={isPositive ? "#00ff88" : "#ff4444"}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: isPositive ? "#00ff88" : "#ff4444" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatDate(t: string): string {
  try {
    return new Date(t).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return t;
  }
}
