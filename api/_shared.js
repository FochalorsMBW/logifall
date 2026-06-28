// Shared logic for both the local Express server (server.js) and the
// Vercel serverless functions (api/*.js). Files prefixed with "_" inside
// /api are NOT treated as routes by Vercel, so this is import-only.

export const MIN_CHARS = 1;
export const MAX_CHARS = 5000;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Read at call time so env vars (dotenv locally, dashboard on Vercel) are ready.
function model() {
  return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

// --- The analysis system prompt is used verbatim as specified. ---
export const SYSTEM_PROMPT = `You are an expert in formal logic and argumentation theory, trained on
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

// Writing-style options for the rewrite feature.
export const REWRITE_STYLES = {
  formal: 'gaya bahasa formal dan baku',
  akademik: 'gaya akademik/ilmiah yang argumentatif dan objektif',
  santai: 'gaya santai dan kasual namun tetap sopan',
  persuasif: 'gaya persuasif yang meyakinkan namun tetap logis dan jujur',
  ringkas: 'gaya ringkas, padat, dan langsung ke inti',
  gaul: 'bahasa gaul Indonesia yang sangat santai dan kekinian ala anak muda Jakarta/medsos — pakai kata seperti "nih", "banget", "gak", "udah", "kayak", "bener", "santuy", "gini/gitu" secara natural, tapi tetap nyambung dan logis (jangan kaku/baku)',
};

// Safely read a JSON body from either Express (req.body parsed) or Vercel
// (req.body may be parsed object, string, or undefined).
export function parseBody(req) {
  const b = req?.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b;
}

// Core Groq call. Returns { ok, content } or { ok:false, status, body }.
async function callGroq(messages, { temperature = 0, maxTokens = 2048, jsonMode = false } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      body: {
        error:
          'Server is missing GROQ_API_KEY. Set it as an environment variable.',
      },
    };
  }

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model(),
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return {
        ok: false,
        status: 502,
        body: {
          error: `Groq API returned ${upstream.status}.`,
          detail: detail.slice(0, 600),
        },
      };
    }

    const data = await upstream.json();
    return { ok: true, content: data?.choices?.[0]?.message?.content ?? '' };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        error: 'Failed to reach the Groq API.',
        detail: String(err?.message || err),
      },
    };
  }
}

// Business logic — returns { status, body } for the caller to send.
export async function analyzeArgument({ text }) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { status: 400, body: { error: 'A "text" string is required.' } };
  }
  if (text.length < MIN_CHARS) {
    return { status: 400, body: { error: `Text must be at least ${MIN_CHARS} characters.` } };
  }
  if (text.length > MAX_CHARS) {
    return { status: 400, body: { error: `Text must be at most ${MAX_CHARS} characters.` } };
  }

  const r = await callGroq(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    { temperature: 0, maxTokens: 2048, jsonMode: true }
  );
  if (!r.ok) return { status: r.status, body: r.body };
  return { status: 200, body: { content: r.content } };
}

export async function rewriteArgument({ text, style, fallacies }) {
  const list = Array.isArray(fallacies)
    ? fallacies.filter((f) => typeof f === 'string').slice(0, 15)
    : [];

  if (typeof text !== 'string' || text.trim().length === 0) {
    return { status: 400, body: { error: 'A "text" string is required.' } };
  }
  if (text.length > MAX_CHARS) {
    return { status: 400, body: { error: `Text must be at most ${MAX_CHARS} characters.` } };
  }

  const styleDesc = REWRITE_STYLES[style];
  if (!styleDesc) {
    return {
      status: 400,
      body: {
        error: `Invalid style. Choose one of: ${Object.keys(REWRITE_STYLES).join(', ')}.`,
      },
    };
  }

  const fallacyNote =
    list.length > 0
      ? `\n\nTeks ini terindikasi mengandung fallacy berikut: ${list.join(
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

  const r = await callGroq(
    [
      { role: 'system', content: rewriteSystemPrompt },
      { role: 'user', content: text },
    ],
    { temperature: 0.3, maxTokens: 1024 }
  );
  if (!r.ok) return { status: r.status, body: r.body };
  return { status: 200, body: { rewritten: (r.content || '').trim() } };
}

export function healthInfo() {
  return {
    status: 200,
    body: { ok: true, model: model(), keyConfigured: Boolean(process.env.GROQ_API_KEY) },
  };
}

// Best-effort in-memory rate limiter (per warm serverless instance).
const hits = new Map();
export function rateLimitOk(ip, max = 12, windowMs = 60 * 1000) {
  const key = ip || 'unknown';
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= max;
}

export function clientIp(req) {
  const fwd = req?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req?.socket?.remoteAddress || 'unknown';
}
