"use client";

interface StrategyExplanationProps {
  explanation: string;
  title?: string;
  onHide?: () => void;
}

const SECTION_KEYS = [
  "策略类型",
  "核心逻辑",
  "使用的指标",
  "买卖信号",
  "可调参数及其影响",
  "适用行情",
  "潜在风险",
] as const;

const SECTION_META: Record<string, { emoji: string; tone?: "neutral" | "green" | "red" | "purple" }> = {
  "策略类型": { emoji: "🧭", tone: "purple" },
  "核心逻辑": { emoji: "🧠", tone: "neutral" },
  "使用的指标": { emoji: "📈", tone: "green" },
  "买卖信号": { emoji: "🔁", tone: "purple" },
  "可调参数及其影响": { emoji: "🎛️", tone: "neutral" },
  "适用行情": { emoji: "🌦️", tone: "green" },
  "潜在风险": { emoji: "⚠️", tone: "red" },
};

function cleanHeading(line: string): string {
  return line
    .replace(/^[-*#\s]+/, "")
    .replace(/^[0-9０-９一二三四五六七八九十]+[).、：:\s-]*/, "")
    .trim();
}

function matchSection(line: string): string | null {
  const normalized = cleanHeading(line);
  const key = SECTION_KEYS.find((candidate) => normalized.startsWith(candidate));
  return key || null;
}

function parseExplanation(text: string) {
  const lines = text.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; body: string[] } | null = null;
  const intro: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (current) current.body.push("");
      continue;
    }

    const matchedHeading = matchSection(line);
    if (matchedHeading) {
      if (current) {
        sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
      }
      current = { heading: matchedHeading, body: [] };
      const remainder = cleanHeading(line).slice(matchedHeading.length).replace(/^[:：\-\s]+/, "").trim();
      if (remainder) current.body.push(remainder);
      continue;
    }

    if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }

  if (current) {
    sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
  }

  return { intro: intro.join("\n").trim(), sections: sections.filter((s) => s.body) };
}

function toneClass(tone?: "neutral" | "green" | "red" | "purple") {
  switch (tone) {
    case "green":
      return "border-bs-green/20 bg-bs-green/5";
    case "red":
      return "border-bs-red/20 bg-bs-red/5";
    case "purple":
      return "border-bs-purple/20 bg-bs-purple/5";
    default:
      return "border-bs-border bg-bs-input/40";
  }
}

export default function StrategyExplanation({
  explanation,
  title = "🧠 Strategy Explanation",
  onHide,
}: StrategyExplanationProps) {
  const { intro, sections } = parseExplanation(explanation);

  return (
    <div className="bg-bs-card border border-bs-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-xs text-bs-muted mt-1">AI-generated reading guide for this strategy.</p>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            className="text-xs text-bs-muted hover:text-white transition-colors"
          >
            Hide
          </button>
        )}
      </div>

      {intro && (
        <div className="text-sm text-bs-muted whitespace-pre-wrap leading-6">
          {intro}
        </div>
      )}

      {sections.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sections.map((section) => {
            const meta = SECTION_META[section.heading] || { emoji: "•", tone: "neutral" as const };
            return (
              <div
                key={section.heading}
                className={`rounded-xl border p-4 ${toneClass(meta.tone)}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{meta.emoji}</span>
                  <h4 className="text-sm font-semibold">{section.heading}</h4>
                </div>
                <div className="text-sm text-bs-muted whitespace-pre-wrap leading-6">
                  {section.body}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-bs-muted whitespace-pre-wrap leading-6">
          {explanation}
        </div>
      )}
    </div>
  );
}
