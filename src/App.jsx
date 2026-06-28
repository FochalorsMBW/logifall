import { useEffect, useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_CHARS = 1;
const MAX_CHARS = 5000;

const PRESETS = [
  {
    label: 'Ad Hominem',
    text:
      "We shouldn't listen to Dr. Smith's climate research because he drives a gas-powered car. His personal choices clearly show he can't be trusted on environmental matters, so the data in his papers must be unreliable too.",
  },
  {
    label: 'False Causality',
    text:
      'Ever since we hired John, our sales dropped 30%. John must be causing the decline. Before he joined everything was fine, and now the numbers are down, so the only reasonable explanation is that John is the problem.',
  },
  {
    label: 'Slippery Slope',
    text:
      "If we allow students to redo one test, soon they'll expect to redo every assignment, and then they'll demand to rewrite final exams. Eventually grades will mean nothing and academic standards will collapse entirely.",
  },
  {
    label: 'Appeal to Authority',
    text:
      'This supplement must be healthy — a famous actor said so on TV. He is one of the most recognizable celebrities in the country, so there is really no reason to question whether the product actually works.',
  },
  {
    label: 'Clean argument (no fallacy)',
    text:
      'Multiple peer-reviewed studies show that regular aerobic exercise reduces the risk of heart disease by improving cardiovascular function. Since I want to lower my risk of heart disease, it is reasonable for me to exercise regularly as part of a broader healthy lifestyle.',
  },
];

const QUALITY_STYLES = {
  Poor: 'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800',
  Fair: 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  Good: 'bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
  Excellent:
    'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
};

const REWRITE_STYLES = [
  { value: 'formal', label: 'Formal' },
  { value: 'akademik', label: 'Akademik' },
  { value: 'santai', label: 'Santai' },
  { value: 'persuasif', label: 'Persuasif' },
  { value: 'ringkas', label: 'Ringkas' },
  { value: 'gaul', label: 'Gaul' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Robustly extract a JSON object from a model response that may include
// prose or markdown code fences around it.
function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function clampConfidence(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function confidenceTone(conf) {
  if (conf >= 0.85) return 'bg-rose-500';
  if (conf >= 0.7) return 'bg-amber-500';
  return 'bg-yellow-500';
}

/* ------------------------------------------------------------------ */
/*  Small presentational components                                    */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }) {
  return (
    <p className="label-caps text-[11px] font-semibold text-stone-400 dark:text-stone-500">
      {children}
    </p>
  );
}

function ConfidenceBar({ confidence }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${confidenceTone(confidence)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-xs tabular-nums text-stone-500 dark:text-stone-400">
        {pct}%
      </span>
    </div>
  );
}

function FallacyCard({ fallacy, index }) {
  const [open, setOpen] = useState(false);
  const confidence = clampConfidence(fallacy.confidence);

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 font-mono text-xs text-white dark:bg-stone-100 dark:text-stone-900">
            {index + 1}
          </span>
          <h3 className="font-serif text-lg font-medium text-stone-900 dark:text-stone-100">
            {fallacy.type || 'Unnamed fallacy'}
          </h3>
        </div>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900">
          Fallacy
        </span>
      </div>

      <div className="mt-4">
        <SectionLabel>Confidence</SectionLabel>
        <div className="mt-1.5">
          <ConfidenceBar confidence={confidence} />
        </div>
      </div>

      {fallacy.span && (
        <blockquote className="mt-4 border-l-2 border-amber-400 bg-amber-50/70 px-4 py-2 font-serif text-[15px] italic text-stone-700 dark:bg-amber-950/20 dark:text-stone-300">
          “{fallacy.span}”
        </blockquote>
      )}

      {fallacy.counter_argument && (
        <div className="mt-4">
          <SectionLabel>How to respond</SectionLabel>
          <p className="mt-1 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
            {fallacy.counter_argument}
          </p>
        </div>
      )}

      {fallacy.explanation && (
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={open}
          >
            <SectionLabel>Why this is a fallacy</SectionLabel>
            <svg
              className={`h-4 w-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {open && (
            <p className="mt-2 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
              {fallacy.explanation}
            </p>
          )}
        </div>
      )}

      {fallacy.academic_reference && (
        <p className="mt-4 font-serif text-xs italic text-stone-400 dark:text-stone-500">
          Maps to: {fallacy.academic_reference}
        </p>
      )}
    </article>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-7 w-40 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
        >
          <div className="h-5 w-1/2 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-2 w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-16 w-full animate-pulse rounded bg-stone-100 dark:bg-stone-800/60" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 px-6 text-center dark:border-stone-700">
      <div className="font-serif text-4xl text-stone-300 dark:text-stone-700">¶</div>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
        Paste an argument and run the analysis. Detected fallacies, sound
        elements, and an overall assessment will appear here.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Results panel                                                      */
/* ------------------------------------------------------------------ */

function Results({ data }) {
  const fallacies = Array.isArray(data.fallacies_detected)
    ? data.fallacies_detected
    : [];
  const soundElements = Array.isArray(data.sound_elements)
    ? data.sound_elements
    : [];
  const quality = data.overall_argument_quality;
  const qualityStyle = QUALITY_STYLES[quality] || QUALITY_STYLES.Fair;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Overall argument quality</SectionLabel>
        {quality && (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${qualityStyle}`}
          >
            {quality}
          </span>
        )}
      </div>

      {fallacies.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-10 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.79a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <h3 className="font-serif text-lg text-emerald-900 dark:text-emerald-200">
            No fallacies detected
          </h3>
          <p className="max-w-sm text-sm leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
            The analysis did not find any fallacies above the confidence
            threshold. Review the assessment below for detail.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <SectionLabel>
            {fallacies.length} fallac{fallacies.length === 1 ? 'y' : 'ies'} detected
          </SectionLabel>
          {fallacies.map((f, i) => (
            <FallacyCard key={i} fallacy={f} index={i} />
          ))}
        </div>
      )}

      {soundElements.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <SectionLabel>Sound elements</SectionLabel>
          <ul className="mt-2 space-y-2">
            {soundElements.map((el, i) => (
              <li
                key={i}
                className="flex gap-2 text-[15px] leading-relaxed text-emerald-900 dark:text-emerald-200"
              >
                <span className="mt-1 text-emerald-500">✓</span>
                <span>{el}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.summary && (
        <div>
          <SectionLabel>Assessment</SectionLabel>
          <p className="mt-2 font-serif text-[16px] leading-relaxed text-stone-700 dark:text-stone-300">
            {data.summary}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rewrite / suggestion panel                                         */
/* ------------------------------------------------------------------ */

function RewritePanel({ text, analysis }) {
  const [style, setStyle] = useState('formal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const canRun = text.trim().length >= 1 && !loading;

  async function run() {
    if (!canRun) return;
    setLoading(true);
    setError('');
    setOutput('');
    setCopied(false);

    try {
      const fallacies = Array.isArray(analysis?.fallacies_detected)
        ? analysis.fallacies_detected.map((f) => f.type).filter(Boolean)
        : [];

      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, style, fallacies }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `Request failed (${res.status}).`);
      }
      setOutput((payload.rewritten || '').trim());
    } catch (err) {
      setError(err?.message || 'Gagal membuat saran.');
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!output) return;
    navigator.clipboard?.writeText(output).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <SectionLabel>Saran perbaikan kalimat</SectionLabel>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm text-stone-500 dark:text-stone-400">
          Gaya bahasa
        </label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-700 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
          aria-label="Pilih gaya bahasa"
        >
          {REWRITE_STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Membuat…
            </>
          ) : (
            'Buat saran'
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {output && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900/60">
          <p className="whitespace-pre-wrap font-serif text-[16px] leading-relaxed text-stone-800 dark:text-stone-100">
            {output}
          </p>
          <button
            type="button"
            onClick={copy}
            className="mt-3 text-xs font-medium text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
          >
            {copied ? 'Tersalin ✓' : 'Salin'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main application                                                   */
/* ------------------------------------------------------------------ */

export default function App() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('lfd-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [rawFallback, setRawFallback] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('lfd-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const charCount = text.length;
  const canAnalyze =
    text.trim().length >= MIN_CHARS && charCount <= MAX_CHARS && !loading;

  const counterColor = useMemo(() => {
    if (charCount > MAX_CHARS) return 'text-rose-600 dark:text-rose-400';
    return 'text-stone-400 dark:text-stone-500';
  }, [charCount]);

  async function analyze() {
    if (!canAnalyze) return;
    setLoading(true);
    setError('');
    setErrorDetail('');
    setRawFallback('');
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload.detail) setErrorDetail(String(payload.detail));
        throw new Error(payload.error || `Request failed (${res.status}).`);
      }

      const parsed = extractJson(payload.content);
      if (!parsed) {
        setRawFallback(payload.content || '');
        throw new Error(
          'The analysis returned a response that could not be parsed as structured JSON.'
        );
      }
      setResult(parsed);
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function onPreset(e) {
    const idx = e.target.value;
    if (idx === '') return;
    setText(PRESETS[Number(idx)].text);
    setResult(null);
    setError('');
    setErrorDetail('');
    setRawFallback('');
    e.target.value = '';
  }

  return (
    <div className="min-h-screen bg-paper-50 font-sans text-stone-800 transition-colors dark:bg-ink-900 dark:text-stone-200">
      {/* Header */}
      <header className="border-b border-stone-200 bg-paper-50/80 backdrop-blur dark:border-stone-800 dark:bg-ink-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 sm:text-3xl">
              Logical Fallacy Detector
            </h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Based on Walton&apos;s Argumentation Schemes &amp; LOGIC Dataset
              (Jin et al., 2022)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark((v) => !v)}
            className="shrink-0 rounded-full border border-stone-300 p-2 text-stone-600 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.95 2.05a1 1 0 010 1.41l-.7.71a1 1 0 11-1.42-1.42l.71-.7a1 1 0 011.41 0zM18 9a1 1 0 110 2h-1a1 1 0 110-2h1zM5.05 4.05a1 1 0 011.41 0l.71.7A1 1 0 015.76 6.17l-.71-.71a1 1 0 010-1.41zM3 9a1 1 0 100 2H2a1 1 0 100-2h1zm2.05 6.95a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.42l-.7.7a1 1 0 01-1.42 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm4.24-1.17a1 1 0 011.42 0l.7.71a1 1 0 01-1.41 1.41l-.71-.7a1 1 0 010-1.42zM10 6a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main two-panel layout */}
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-2">
        {/* Input panel */}
        <section className="flex flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionLabel>Argument to analyze</SectionLabel>
            <select
              onChange={onPreset}
              defaultValue=""
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-600 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
              aria-label="Load an example"
            >
              <option value="">Load an example…</option>
              {PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHARS}
            placeholder="Tempel sebuah argumen, satu paragraf, atau satu kalimat yang ingin diperiksa — panjang bebas. Contoh: “orang di desa kan tidak memakai dolar, jadi kenapa harus takut”."
            className="scrollbar-slim min-h-[320px] flex-1 resize-y rounded-lg border border-stone-300 bg-white p-4 font-serif text-[16px] leading-relaxed text-stone-800 shadow-sm outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-stone-800"
          />

          <div className="mt-2 flex items-center justify-end text-xs">
            <span className={`font-mono tabular-nums ${counterColor}`}>
              {charCount} / {MAX_CHARS}
            </span>
          </div>

          <button
            type="button"
            onClick={analyze}
            disabled={!canAnalyze}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              'Analyze argument'
            )}
          </button>
        </section>

        {/* Results panel */}
        <section className="lg:border-l lg:border-stone-200 lg:pl-6 dark:lg:border-stone-800">
          {loading && <ResultsSkeleton />}

          {!loading && error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/40">
              <h3 className="font-serif text-base font-medium text-rose-800 dark:text-rose-200">
                Analysis failed
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-rose-700 dark:text-rose-300">
                {error}
              </p>
              {errorDetail && (
                <details className="mt-3" open>
                  <summary className="cursor-pointer text-xs font-medium text-rose-600 dark:text-rose-400">
                    Provider detail
                  </summary>
                  <pre className="scrollbar-slim mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-3 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
                    {errorDetail}
                  </pre>
                </details>
              )}
              {rawFallback && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-rose-600 dark:text-rose-400">
                    Show raw response
                  </summary>
                  <pre className="scrollbar-slim mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-3 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
                    {rawFallback}
                  </pre>
                </details>
              )}
            </div>
          )}

          {!loading && !error && result && <Results data={result} />}

          {!loading && !error && !result && <EmptyState />}

          {!loading && text.trim().length > 0 && (
            <RewritePanel text={text} analysis={result} />
          )}
        </section>
      </main>

      {/* Credibility footer */}
      <footer className="mt-8 border-t border-stone-200 bg-paper-100/60 dark:border-stone-800 dark:bg-ink-800/40">
        <div className="mx-auto max-w-6xl space-y-3 px-5 py-8 text-sm text-stone-500 dark:text-stone-400">
          <p className="font-serif italic leading-relaxed">
            Detection methodology based on: Walton, D. (1996).{' '}
            <span className="not-italic">Argumentation Schemes for Presumptive Reasoning</span>;
            Jin et al. (2022). <span className="not-italic">LOGIC: Logical Fallacy
            Detection Under Context.</span> EMNLP 2022.
          </p>
          <p className="border-t border-stone-200 pt-3 text-xs leading-relaxed text-stone-400 dark:border-stone-800 dark:text-stone-500">
            AI-assisted detection. Results should be reviewed by a critical
            thinking expert for high-stakes decisions.
          </p>
        </div>
      </footer>
    </div>
  );
}
