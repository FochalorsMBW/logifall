import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  analyzeArgument,
  rewriteArgument,
  healthInfo,
} from './api/_shared.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind a single reverse proxy in most hosts — lets express-rate-limit
// read the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 3001;

// Per-IP limit on the key-consuming endpoints.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
});

app.post('/api/analyze', limiter, async (req, res) => {
  const { status, body } = await analyzeArgument({ text: req.body?.text });
  res.status(status).json(body);
});

app.post('/api/rewrite', limiter, async (req, res) => {
  const { status, body } = await rewriteArgument({
    text: req.body?.text,
    style: req.body?.style,
    fallacies: req.body?.fallacies,
  });
  res.status(status).json(body);
});

app.get('/api/health', (_req, res) => {
  const { status, body } = healthInfo();
  res.status(status).json(body);
});

// In production (e.g. Render or `npm start`), serve the built frontend.
// On Vercel the static site + /api functions are served by the platform,
// so this block simply does nothing there.
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
