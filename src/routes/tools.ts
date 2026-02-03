import { Hono } from 'hono';
import { z } from 'zod';

export const tools = new Hono();

// 7-word description linter
const lintSchema = z.object({
  description: z.string(),
});

function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

function suggestCompression(description: string): string[] {
  const suggestions: string[] = [];
  const words = description.trim().split(/\s+/);

  // Common compressions
  const replacements: [RegExp, string][] = [
    [/\bfor the\b/gi, 'for'],
    [/\bfrom the\b/gi, 'from'],
    [/\bin the\b/gi, 'in'],
    [/\bto the\b/gi, 'to'],
    [/\band then\b/gi, 'then'],
    [/\bas well as\b/gi, 'and'],
    [/\bin order to\b/gi, 'to'],
    [/\bPDF files\b/gi, 'PDFs'],
    [/\bJSON files\b/gi, 'JSON'],
    [/\btext files\b/gi, 'text'],
    [/\bimage files\b/gi, 'images'],
    [/\bdata from\b/gi, 'data'],
    [/\binformation from\b/gi, 'info'],
    [/\bstructured data\b/gi, 'structured-data'],
    [/\bmachine learning\b/gi, 'ML'],
    [/\bnatural language\b/gi, 'NL'],
    [/\bartificial intelligence\b/gi, 'AI'],
  ];

  let compressed = description;
  for (const [pattern, replacement] of replacements) {
    const newCompressed = compressed.replace(pattern, replacement);
    if (newCompressed !== compressed && countWords(newCompressed) < countWords(compressed)) {
      compressed = newCompressed;
    }
  }

  if (compressed !== description) {
    suggestions.push(compressed.trim());
  }

  // Suggest hyphenation for common compound words
  const hyphenatable = [
    ['PDF', 'to', 'JSON'],
    ['JSON', 'to', 'CSV'],
    ['text', 'to', 'speech'],
    ['speech', 'to', 'text'],
    ['image', 'to', 'text'],
  ];

  for (const compound of hyphenatable) {
    const pattern = new RegExp(compound.join('\\s+'), 'gi');
    if (pattern.test(description)) {
      suggestions.push(description.replace(pattern, compound.join('-')));
    }
  }

  return [...new Set(suggestions)].filter(s => countWords(s) <= 7);
}

// POST /tools/lint-description
tools.post('/lint-description', async (c) => {
  const body = await c.req.json();
  const parsed = lintSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
  }

  const { description } = parsed.data;
  const wordCount = countWords(description);
  const isValid = wordCount === 7;

  const result: {
    description: string;
    wordCount: number;
    isValid: boolean;
    error?: string;
    suggestions?: string[];
  } = {
    description,
    wordCount,
    isValid,
  };

  if (!isValid) {
    if (wordCount < 7) {
      result.error = `Too few words (${wordCount}/7). Be more specific.`;
    } else {
      result.error = `Too many words (${wordCount}/7). Compress your description.`;
      result.suggestions = suggestCompression(description);
    }
  }

  return c.json(result);
});

// GET /tools/word-count?text=...
tools.get('/word-count', (c) => {
  const text = c.req.query('text') || '';
  return c.json({
    text,
    wordCount: countWords(text),
    isValid: countWords(text) === 7,
  });
});
