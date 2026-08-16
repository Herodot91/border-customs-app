import twilio from 'twilio';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, code } = req.body ?? {};
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  try {
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({ to: phone, code });

    if (check.status === 'approved') {
      res.json({ ok: true });
    } else {
      res.status(400).json({ error: 'Invalid code' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
