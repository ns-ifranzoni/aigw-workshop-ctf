/**
 * Minimal in-memory rate limiter for the authentication endpoints.
 *
 * Design note, because the obvious limiter would break a real workshop: a
 * classroom of 100 participants usually shares one public IP, so a plain
 * per-IP cap would lock everybody out during the opening burst of
 * registrations and logins. Two decisions avoid that:
 *
 *   1. Only FAILED attempts count. Successful logins and registrations are
 *      never throttled, so normal use is unaffected no matter how many people
 *      sit behind the same NAT.
 *   2. The primary key is the target (IP + username), because credential
 *      guessing aims at one account. A looser per-IP ceiling still catches
 *      spraying across many usernames.
 *
 * State is per process, which is right for this single-container app. It is
 * lost on restart — acceptable: this raises the cost of guessing 5-8 character
 * passwords, it is not an audited security control.
 *
 * `req.ip` is the socket address unless Express is configured to trust a proxy.
 * Behind a reverse proxy every client collapses into one IP, which is why the
 * per-IP ceiling is deliberately generous and the per-username limit does the
 * real work.
 */

const buckets = new Map(); // key → { count, resetAt }

// Drop expired buckets periodically so a long-running instance does not grow
// one entry per attempted username forever.
const SWEEP_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}, SWEEP_MS).unref();

function hit(key, windowMs, max) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { blocked: false };
  }
  b.count += 1;
  return { blocked: b.count > max, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

function peek(key, max) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= Date.now()) return { blocked: false };
  // >= so that `max` is the number of failures allowed, not the number after
  // which one more still gets through.
  return { blocked: b.count >= max, retryAfter: Math.ceil((b.resetAt - Date.now()) / 1000) };
}

/**
 * @param {object}   opts
 * @param {number}   opts.windowMs      how long a bucket lives
 * @param {number}   opts.max           failures allowed per window
 * @param {function} opts.key           req → bucket key (or null to skip)
 * @param {number}   [opts.ipMax]       looser ceiling for the IP as a whole
 * @param {string}   [opts.scope]       namespace, so routes don't share buckets
 */
function limitFailures({ windowMs, max, key, ipMax, scope = 'default' }) {
  return (req, res, next) => {
    const targetKey = key(req);
    const ipKey = `${scope}:ip:${req.ip}`;

    for (const [k, cap] of [[targetKey && `${scope}:${targetKey}`, max], [ipMax ? ipKey : null, ipMax]]) {
      if (!k) continue;
      const state = peek(k, cap);
      if (state.blocked) {
        const mins = Math.max(1, Math.ceil(state.retryAfter / 60));
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
          retry_after_seconds: state.retryAfter,
        });
      }
    }

    // Count the attempt only once the response is known, and only if it failed.
    res.on('finish', () => {
      if (res.statusCode < 400 || res.statusCode === 429) return;
      if (targetKey) hit(`${scope}:${targetKey}`, windowMs, max);
      if (ipMax) hit(ipKey, windowMs, ipMax);
    });

    next();
  };
}

// Test/maintenance helper: forget all recorded attempts.
function reset() { buckets.clear(); }

module.exports = { limitFailures, reset };
