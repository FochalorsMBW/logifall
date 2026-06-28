import { analyzeArgument, parseBody, rateLimitOk, clientIp } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!rateLimitOk(clientIp(req))) {
    return res
      .status(429)
      .json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const { text } = parseBody(req);
  const { status, body } = await analyzeArgument({ text });
  return res.status(status).json(body);
}
