import { Router, Request, Response } from 'express';
import OpenAI from 'openai';

const router = Router();

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:3200';
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-20250514';

const openai = new OpenAI({
  baseURL: 'https://cliproxy.exe.xyz/v1',
  apiKey: 'sk-uQLEU2nj1uEYU0zbv',
  timeout: 30000,
});

const STRATEGY_SYSTEM_PROMPT = `You are an expert quantitative strategy developer. You write Python trading strategies using the backtesting.py library.

## Rules
1. The strategy class MUST inherit from \`backtesting.Strategy\`
2. You MUST implement \`init(self)\` and \`next(self)\` methods
3. You can use: pandas, numpy, ta, backtesting.lib (crossover, etc.)
4. Tunable parameters MUST be declared as class-level attributes (e.g. \`fast_period = 10\`)
5. Use \`self.I()\` to wrap indicator functions in \`init()\`
6. Use \`self.buy()\`, \`self.sell()\`, \`self.position\` in \`next()\`
7. Return ONLY the Python code, no markdown fences, no explanation

## Example Strategy Format
\`\`\`python
from backtesting import Strategy
from backtesting.lib import crossover
import numpy as np
import pandas as pd

def SMA(values, n):
    return pd.Series(values).rolling(n).mean().values

class SmaCross(Strategy):
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
\`\`\`
`;

/**
 * Extract Python code from LLM response (strips markdown fences if present)
 */
function extractCode(text: string): string {
  // Try to extract from markdown code block
  const match = text.match(/```(?:python)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  return text.trim();
}

/**
 * Extract strategy name and description from code
 */
function extractMeta(code: string): { name: string; description: string } {
  // Try class name
  const classMatch = code.match(/class\s+(\w+)\s*\(\s*Strategy\s*\)/);
  const name = classMatch ? classMatch[1] : 'CustomStrategy';

  // Try docstring
  const docMatch = code.match(/class\s+\w+\s*\(\s*Strategy\s*\):\s*\n\s*"""([\s\S]*?)"""/);
  const description = docMatch ? docMatch[1].trim().split('\n')[0] : `AI-generated strategy: ${name}`;

  return { name, description };
}

/**
 * Validate code via Python engine
 */
async function validateCode(code: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(`${PYTHON_ENGINE_URL}/engine/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { valid: false, error: `Engine returned ${res.status}: ${errText}` };
    }
    const result = await res.json() as any;
    return { valid: result.valid ?? true, error: result.error };
  } catch (err: any) {
    return { valid: false, error: `Engine unreachable: ${err.message}` };
  }
}

/**
 * POST /api/ai/generate-strategy
 * body: { prompt: string }
 * → LLM 生成 Python 策略代码 → 自动验证 → 返回 { code, name, description, valid }
 */
router.post('/generate-strategy', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: STRATEGY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate a Python trading strategy based on this description:\n\n${prompt}\n\nReturn ONLY the Python code.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });

    const rawResponse = completion.choices[0]?.message?.content || '';
    const code = extractCode(rawResponse);
    const { name, description } = extractMeta(code);

    // Validate via Python engine
    const validation = await validateCode(code);

    res.json({
      code,
      name,
      description,
      valid: validation.valid,
      validationError: validation.error || null,
    });
  } catch (err: any) {
    console.error('POST /api/ai/generate-strategy error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/improve-strategy
 * body: { code: string, instruction: string }
 * → LLM 修改策略 → 自动验证 → 返回 { code, changes, valid }
 */
router.post('/improve-strategy', async (req: Request, res: Response) => {
  try {
    const { code, instruction } = req.body;
    if (!code || !instruction) {
      return res.status(400).json({ error: 'code and instruction are required' });
    }

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: STRATEGY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Here is an existing trading strategy:\n\n\`\`\`python\n${code}\n\`\`\`\n\nModify it according to this instruction: ${instruction}\n\nFirst, on the first line, write a brief summary of changes (prefixed with "CHANGES:"). Then output the complete modified Python code.`,
        },
      ],
      temperature: 0.5,
      max_tokens: 4096,
    });

    const rawResponse = completion.choices[0]?.message?.content || '';

    // Extract changes summary
    let changes = '';
    let codeText = rawResponse;
    const changesMatch = rawResponse.match(/^CHANGES:\s*(.+?)(?:\n|$)/m);
    if (changesMatch) {
      changes = changesMatch[1].trim();
      codeText = rawResponse.slice(changesMatch.index! + changesMatch[0].length);
    }

    const improvedCode = extractCode(codeText);

    // Validate
    const validation = await validateCode(improvedCode);

    res.json({
      code: improvedCode,
      changes,
      valid: validation.valid,
      validationError: validation.error || null,
    });
  } catch (err: any) {
    console.error('POST /api/ai/improve-strategy error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/explain-strategy
 * body: { code: string }
 * → LLM 解释策略逻辑 → 返回 { explanation: string }
 */
router.post('/explain-strategy', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert quantitative analyst. Explain trading strategies clearly in Chinese (中文). Cover: 1) 策略类型 2) 核心逻辑 3) 使用的指标 4) 买卖信号 5) 可调参数及其影响 6) 适用行情 7) 潜在风险',
        },
        {
          role: 'user',
          content: `请解释以下交易策略的逻辑：\n\n\`\`\`python\n${code}\n\`\`\``,
        },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    const explanation = completion.choices[0]?.message?.content || '';

    res.json({ explanation });
  } catch (err: any) {
    console.error('POST /api/ai/explain-strategy error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
