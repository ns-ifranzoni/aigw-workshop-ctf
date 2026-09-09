const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = db;
const SESSION_VERSION = 2;

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Try API token first (admin api_key). Admin tokens are 48 hex chars
  // (randomBytes(24)); the length floor keeps a short, empty or placeholder
  // api_key from ever authenticating, whatever put it in the table.
  const MIN_API_TOKEN_LENGTH = 32;
  if (token.length >= MIN_API_TOKEN_LENGTH) {
    const apiKeyRow = db.prepare('SELECT code, api_key, role FROM access_codes WHERE api_key = ? AND role = ?').get(token, 'admin');
    if (apiKeyRow) {
      req.user = { code: apiKeyRow.code, role: apiKeyRow.role, api_key: apiKeyRow.api_key };
      return next();
    }
  }

  // Fall back to JWT
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.session_version !== SESSION_VERSION) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const row = db.prepare('SELECT code, api_key, role FROM access_codes WHERE code = ?').get(payload.code);
    if (!row) return res.status(401).json({ error: 'Invalid session' });

    req.user = {
      ...payload,
      code: row.code,
      role: row.role,
      api_key: row.api_key,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET, SESSION_VERSION };
