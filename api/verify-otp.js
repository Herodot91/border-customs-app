import { generateCode } from './otp-util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, code } = req.body ?? {};
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  // Accept current slot or the previous one (handles boundary edge cases)
  const valid =
    code === generateCode(phone, process.env.OTP_SECRET, 0) ||
    code === generateCode(phone, process.env.OTP_SECRET, -1);

  if (valid) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Invalid or expired code' });
  }
}
