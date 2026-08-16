import { createHmac } from 'crypto';

const SLOT = 5 * 60 * 1000; // 5-minute window

export function generateCode(phone, secret, offset = 0) {
  const slot = Math.floor((Date.now() + offset * SLOT) / SLOT);
  const hmac = createHmac('sha256', secret);
  hmac.update(`${phone}:${slot}`);
  const hex = hmac.digest('hex');
  return String((parseInt(hex.slice(0, 8), 16) % 900000) + 100000);
}
