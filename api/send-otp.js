import twilio from 'twilio';
import { generateCode } from './otp-util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  const code = generateCode(phone, process.env.OTP_SECRET);

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    await client.messages.create({
      body: `BP·CS Console — cod acces / access code: ${code}. Valabil 5 min / Valid 5 min.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
