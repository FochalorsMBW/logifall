# Logical Fallacy Detector

An academic argument-analysis tool that detects logical fallacies in text
using a chain-of-thought prompting approach grounded in **Walton's
Argumentation Schemes (1996)** and the **LOGIC dataset taxonomy
(Jin et al., 2022)**.

The frontend is a single React component (`src/App.jsx`) styled with
Tailwind CSS. A small Express server (`server.js`) acts as a proxy so the
Groq API key stays on the server and never reaches the browser.

## Detection coverage

The system prompt asks the model to reason in five steps (claim extraction →
premise identification → scheme matching → fallacy detection → confidence
scoring) and to return structured JSON. It targets the 15 LOGIC-dataset
categories: Ad Hominem, Ad Populum, Appeal to Emotion, Appeal to False
Authority, Circular Reasoning, Equivocation, False Causality, False Dilemma,
Faulty Generalization, Intentional Fallacy, Red Herring, Slippery Slope,
Straw Man, Sunk Cost, and Bandwagon. Only fallacies with confidence > 0.6
are reported.

## Prerequisites

- Node.js 18+ (the server uses the built-in global `fetch`)
- A Groq API key (free, no credit card — get one at
  https://console.groq.com/keys)

## Setup

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# then edit .env and set GROQ_API_KEY
```

## Development

Runs the Vite dev server (port 5173) and the API proxy (port 3001) together:

```bash
npm run dev
```

Open http://localhost:5173. Requests to `/api/*` are proxied to the Express
server, which forwards them to the Groq API.

## Production build

```bash
npm run build     # outputs static assets to dist/
npm start         # serves dist/ AND the /api proxy from server.js (port 3001)
```

Then open http://localhost:3001.

## How it works

```
Browser (App.jsx)  ──POST /api/analyze──▶  server.js (Express)
                                              │  adds Authorization: Bearer header
                                              ▼
                              api.groq.com/openai/v1/chat/completions
```

- `server.js` validates the input length (1–5000 chars), injects the exact
  system prompt as the system message, calls the Groq chat completions API
  (OpenAI-compatible) with `temperature: 0` and JSON response mode, and
  returns the model's text content.
- `App.jsx` extracts the JSON object from that text (tolerating markdown code
  fences) and renders the results. If parsing fails, the raw response is shown
  for inspection.
- The analysis follows the language of the input text (e.g. Indonesian in,
  Indonesian out).

### Rewrite suggestions

`POST /api/rewrite` takes `{ text, style, fallacies? }` and returns
`{ rewritten }` — a cleaned-up version of the argument that fixes logical
fallacies, in the chosen writing style (`formal`, `akademik`, `santai`,
`persuasif`, `ringkas`, `gaul`). Both endpoints are protected by a per-IP rate limit
(12 requests/minute).

## Configuration

| Variable       | Default                    | Purpose                     |
| -------------- | -------------------------- | --------------------------- |
| `GROQ_API_KEY` | _(required)_               | Server-side Groq key        |
| `GROQ_MODEL`   | `llama-3.3-70b-versatile`  | Model used for analysis     |
| `PORT`         | `3001`                     | Port for the Express server |

## Disclaimer

AI-assisted detection. Results should be reviewed by a critical thinking
expert for high-stakes decisions.
