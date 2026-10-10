/**
 * Fixed-window limiter for endpoints that are attractive to brute-force or
 * resource-exhaustion attacks. It intentionally has no external dependency
 * and is scoped to a single process; use a shared store at the edge when the
 * API is deployed on multiple instances.
 */
function getClientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ windowMs, max, message, maxKeys = 10_000 }) {
  const buckets = new Map();
  let lastPruneAt = 0;

  function pruneExpiredBuckets(now) {
    // Prune at most once per window so a hostile stream of unique IPs does not
    // make cleanup itself expensive on every request.
    if (now - lastPruneAt < windowMs) return;

    lastPruneAt = now;
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    pruneExpiredBuckets(now);

    const key = getClientKey(req);
    const current = buckets.get(key);
    // Keep the in-process fallback bounded even if an attacker sends a large
    // number of spoofed/unique source addresses. Production still needs a
    // shared limiter at the gateway for cross-instance protection.
    if (!current && buckets.size >= maxKeys) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    const bucket = !current || now >= current.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : current;

    if (bucket.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      res.set("RateLimit-Limit", String(max));
      res.set("RateLimit-Remaining", "0");
      res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
      return res.status(429).json({ message });
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    return next();
  };
}

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Demasiados intentos de inicio de sesión. Inténtalo nuevamente más tarde.",
});

const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Demasiadas solicitudes de restablecimiento. Inténtalo nuevamente más tarde.",
});

const uploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Demasiadas cargas de archivos. Inténtalo nuevamente más tarde.",
});

module.exports = {
  createRateLimiter,
  getClientKey,
  loginRateLimiter,
  passwordResetRateLimiter,
  uploadRateLimiter,
};
