import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Render (and most PaaS) put the app behind a single reverse proxy.
// This lets express-rate-limit read the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));

// Limit how often a single IP can hit the (key-consuming) analyze endpoint.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 12, // max requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please wait a minute and try again.',
  },
});

const PORT = process.env.PORT || 3001;
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MIN_CHARS = 1;
const MAX_CHARS = 5000;

// --- The system prompt is used verbatim as specified. ---
const SYSTEM_PROMPT = `You are an expert in formal logic and argumentation theory, trained on
Walton's Argumentation Schemes and the LOGIC dataset (Jin et al., 2022).

Analyze the given text for logical fallacies using this structured
chain-of-thought process:

STEP 1 - CLAIM EXTRACTION: Identify the main claim or conclusion being made.
STEP 2 - PREMISE IDENTIFICATION: List the premises/reasons provided.
STEP 3 - SCHEME MATCHING: Match against Walton's 60+ argumentation schemes.
STEP 4 - FALLACY DETECTION: Check for violations in each detected scheme.
STEP 5 - CONFIDENCE SCORING: Rate each detected fallacy 0.0-1.0 based on
          how clearly the text exhibits the fallacy pattern.

Return a JSON object:
{
  "fallacies_detected": [
    {
      "type": "fallacy name",
      "confidence": 0.0-1.0,
      "span": "exact quote from text that contains the fallacy",
      "explanation": "why this is a fallacy based on argumentation theory",
      "counter_argument": "how to fix or respond to this fallacy",
      "academic_reference": "which scheme/category this maps to"
    }
  ],
  "overall_argument_quality": "Poor/Fair/Good/Excellent",
  "sound_elements": ["list of logically valid parts of the argument"],
  "summary": "one paragraph overall assessment"
}

Only flag fallacies you are highly confident about (confidence > 0.6).
If no fallacies are found, say so clearly with explanation.

LANGUAGE: Detect the language of the analyzed text and write every
human-readable value ("explanation", "counter_argument", "summary",
"sound_elements", and "academic_reference") in that same language. If the
text is in Indonesian, respond in natural Bahasa Indonesia. Keep all JSON
keys exactly as specified (in English), and the value of
"overall_argument_quality" must remain exactly one of: Poor, Fair, Good,
Excellent (do not translate it). You may also write the "type" value in the
text's language, but keep the fallacy name recognizable.

SHORT INPUTS: The text may be a single short sentence. Analyze it as given
without requiring additional context, and only report a fallacy if the
pattern is genuinely present.`;

app.post('/api/analyze', analyzeLimiter, async (req, res) => {
  const text = req.body?.text;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'A "text" string is required.' });
  }
  if (text.length < MIN_CHARS) {
    return res
      .status(400)
      .json({ error: `Text must be at least ${MIN_CHARS} characters.` });
  }
  if (text.length > MAX_CHARS) {
    return res
      .status(400)
      .json({ error: `Text must be at most ${MAX_CHARS} characters.` });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        'Server is missing GROQ_API_KEY. Copy .env.example to .env and add your key.',
    });
  }

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(502).json({
        error: `Groq API returned ${upstream.status}.`,
        detail: detail.slice(0, 600),
      });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    return res.json({ content });
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to reach the Groq API.',
      detail: String(err?.message || err),
    });
  }
});

// Writing-style options for the rewrite feature.
const REWRITE_STYLES = {
  formal: 'gaya bahasa formal dan baku',
  akademik: 'gaya akademik/ilmiah yang argumentatif dan objektif',
  santai: 'gaya santai dan kasual namun tetap sopan',
  persuasif: 'gaya persuasif yang meyakinkan namun tetap logis dan jujur',
  ringkas: 'gaya ringkas, padat, dan langsung ke inti',
  gaul: 'bahasa gaul Indonesia yang sangat santai dan kekinian ala anak muda Jakarta/medsos — pakai kata seperti "nih", "banget", "gak", "udah", "kayak", "bener", "santuy", "gini/gitu" secara natural, tapi tetap nyambung dan logis (jangan kaku/baku)',
};

app.post('/api/rewrite', analyzeLimiter, async (req, res) => {
  const text = req.body?.text;
  const style = req.body?.style;
  const fallacies = Array.isArray(req.body?.fallacies)
    ? req.body.fallacies.filter((f) => typeof f === 'string').slice(0, 15)
    : [];

  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'A "text" string is required.' });
  }
  if (text.length > MAX_CHARS) {
    return res
      .status(400)
      .json({ error: `Text must be at most ${MAX_CHARS} characters.` });
  }

  const styleDesc = REWRITE_STYLES[style];
  if (!styleDesc) {
    return res.status(400).json({
      error: `Invalid style. Choose one of: ${Object.keys(REWRITE_STYLES).join(', ')}.`,
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        'Server is missing GROQ_API_KEY. Copy .env.example to .env and add your key.',
    });
  }

  const fallacyNote =
    fallacies.length > 0
      ? `\n\nTeks ini terindikasi mengandung fallacy berikut: ${fallacies.join(
          ', '
        )}. Perbaiki khususnya bagian-bagian tersebut.`
      : '';

  const rewriteSystemPrompt = `Anda adalah penyunting dan pelatih argumentasi yang ahli.
Tulis ulang argumen pengguna agar:
- bebas dari kesalahan logika (logical fallacy),
- tetap mempertahankan maksud dan inti pesan aslinya,
- jernih, runtut, dan logis.

Tulis hasilnya dalam ${styleDesc}.
Balas dalam bahasa yang sama dengan teks masukan (jika teks berbahasa
Indonesia, balas dalam Bahasa Indonesia).
Kembalikan HANYA teks argumen hasil perbaikan sebagai teks biasa, tanpa
pembukaan, tanpa label, tanpa tanda kutip, dan tanpa penjelasan tambahan.${fallacyNote}`;

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(502).json({
        error: `Groq API returned ${upstream.status}.`,
        detail: detail.slice(0, 600),
      });
    }

    const data = await upstream.json();
    const rewritten = (data?.choices?.[0]?.message?.content ?? '').trim();
    return res.json({ rewritten });
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to reach the Groq API.',
      detail: String(err?.message || err),
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, keyConfigured: Boolean(process.env.GROQ_API_KEY) });
});

// In production, serve the built frontend from /dist.
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Fallacy detector API listening on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('Warning: GROQ_API_KEY is not set. /api/analyze will return 500.');
  }
});
