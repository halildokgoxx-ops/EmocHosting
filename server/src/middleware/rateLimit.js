import { getClientIp } from '../utils/security.js';

/**
 * Creates a memory-bounded sliding-window rate limiter middleware.
 */
export function createRateLimiter({
  windowMs = 60_000,
  max = 120,
  keyFn = (req) => getClientIp(req) || 'unknown',
  message = 'Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.',
} = {}) {
  const buckets = new Map();

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of buckets.entries()) {
      const fresh = timestamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) buckets.delete(key);
      else buckets.set(key, fresh);
    }
  }, Math.max(30_000, windowMs));
  cleanupTimer.unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const key = String(keyFn(req) || 'unknown');
    const now = Date.now();
    const cutoff = now - windowMs;

    const existing = buckets.get(key) || [];
    const recent = existing.filter((ts) => ts > cutoff);

    if (recent.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message });
    }

    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}
