import { healthInfo } from './_shared.js';

export default function handler(_req, res) {
  const { status, body } = healthInfo();
  return res.status(status).json(body);
}
