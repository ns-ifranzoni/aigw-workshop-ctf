/**
 * Thin caching wrapper for the settings table.
 * TTL of 5 s — short enough to pick up admin changes almost immediately,
 * long enough to avoid hammering SQLite on every authenticated request.
 *
 * Use setSetting() to write AND invalidate so readers see the change within
 * the next poll cycle rather than waiting for the TTL.
 */
const db = require('./db');

const TTL_MS = 5_000;
const _cache = new Map(); // key → { value, expiresAt }

function getSetting(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  const value = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  _cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
  // Immediate invalidation so the next read reflects the write.
  _cache.delete(key);
}

function invalidate(key) {
  if (key) _cache.delete(key);
  else _cache.clear();
}

module.exports = { getSetting, setSetting, invalidate };
