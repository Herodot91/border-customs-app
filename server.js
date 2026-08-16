/**
 * OTP Backend — Joint Operational Console
 * Handles SMS one-time-password generation and verification via Twilio.
 * Runs on port 3001 (Vite dev server proxies /api/* here).
 */
import express from 'express';
import twilio  from 'twilio';
import dotenv  from 'dotenv';
import cors    from 'cors';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(express.json());
app.use(cors({ origin: ['http://localhost:3000', 'http://192.168.0.250:3000'] }));

// ── Twilio client ─────────────────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── In-memory OTP store ───────────────────────────────────────────────────────
// phone (E.164) → { code, expiry, attempts, sentAt }
const otpStore = new Map();

const OTP_TTL_MS      = 5 * 60 * 1000;  // 5 minutes validity
const RESEND_DELAY_MS = 60  * 1000;      // minimum gap between resends
const MAX_ATTEMPTS    = 3;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalise(phone) {
  const stripped = phone.replace(/\s/g, '');
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

// ── POST /api/send-otp ────────────────────────────────────────────────────────
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

  const e164 = normalise(phone);

  // Rate-limit: one send per RESEND_DELAY_MS per number
  const existing = otpStore.get(e164);
  if (existing && Date.now() < existing.sentAt + RESEND_DELAY_MS) {
    const wait = Math.ceil((existing.sentAt + RESEND_DELAY_MS - Date.now()) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }

  const code   = generateCode();
  const expiry = Date.now() + OTP_TTL_MS;
  otpStore.set(e164, { code, expiry, attempts: 0, sentAt: Date.now() });

  try {
    await twilioClient.messages.create({
      body: `BP·CS Joint Console — access code: ${code}. Valid 5 min. Do not share.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   e164,
    });
    console.log(`[OTP] Sent to ${e164}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[OTP] Twilio error:', err.message);
    otpStore.delete(e164);
    // Give a clear hint for the most common trial-account error
    const msg = err.message?.includes('unverified')
      ? `Trial account: ${e164} is not a verified number. Verify it at console.twilio.com or upgrade the account.`
      : err.message?.includes('invalid username') || err.message?.includes('authenticate')
      ? 'Twilio credentials are invalid. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local.'
      : `SMS delivery failed: ${err.message}`;
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/verify-otp ──────────────────────────────────────────────────────
app.post('/api/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code are required.' });

  const e164 = normalise(phone);
  const entry = otpStore.get(e164);

  if (!entry) return res.status(400).json({ error: 'No code was sent to this number. Request a new one.' });

  if (Date.now() > entry.expiry) {
    otpStore.delete(e164);
    return res.status(400).json({ error: 'Code expired. Request a new one.' });
  }

  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(e164);
    return res.status(400).json({ error: 'Too many failed attempts. Request a new code.' });
  }

  if (entry.code !== String(code).trim()) {
    const left = MAX_ATTEMPTS - entry.attempts;
    return res.status(400).json({ error: `Invalid code. ${left} attempt${left !== 1 ? 's' : ''} remaining.` });
  }

  otpStore.delete(e164); // single-use
  console.log(`[OTP] Verified for ${e164}`);
  res.json({ success: true });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.OTP_PORT || 3001;
app.listen(PORT, () => {
  console.log(`[OTP server] listening on http://localhost:${PORT}`);
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.warn('[OTP server] WARNING: TWILIO_ACCOUNT_SID not set in .env.local');
  }
});
