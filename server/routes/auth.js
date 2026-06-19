const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../db');
const ns = require('../netskope');
const { JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
const { PARTICIPANT_ICONS } = require('../constants');

const router = express.Router();

// ── Login ─────────────────────────────────────────────────────────────────────
// All users: { username, password }
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username) return res.status(400).json({ error: 'Username and password required' });

  const row = db.prepare("SELECT * FROM access_codes WHERE username = ?").get(username.trim());
  if (!row) return res.status(401).json({ error: 'Invalid username or password' });

  // Default admin with no password yet → first-login password setup.
  // Checked before requiring a password, so signing in with an empty password
  // (or any value) triggers the setup prompt instead of failing silently.
  if (!row.password_hash) {
    if (row.role === 'admin') {
      return res.json({ setup_required: true, username: row.username });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (!password) return res.status(400).json({ error: 'Username and password required' });

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  const keyInfo = db.prepare('SELECT netskope_token_group_name, netskope_token_name FROM api_keys WHERE key = ?').get(row.api_key);

  const payload = {
    session_version: SESSION_VERSION,
    code: row.code,
    role: row.role,
    username: row.username || null,
    token_group_name: keyInfo?.netskope_token_group_name || null,
    token_name: keyInfo?.netskope_token_name || null,
    icon: row.icon || null,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  res.json({
    token,
    role: row.role,
    username: row.username || null,
    token_group_name: payload.token_group_name,
    token_name: payload.token_name,
    icon: row.icon || null,
  });
});

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, registration_code } = req.body;

  if (!username || !password || !registration_code) {
    return res.status(400).json({ error: 'username, password and registration_code are required' });
  }

  const usernameClean = username.trim();
  if (usernameClean.length < 5 || usernameClean.length > 8) {
    return res.status(400).json({ error: 'Username must be between 5 and 8 characters' });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(usernameClean)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, _ and -' });
  }
  if (password.length < 5 || password.length > 8) {
    return res.status(400).json({ error: 'Password must be between 5 and 8 characters' });
  }

  // Check registration is open
  const regOpenRow = db.prepare("SELECT value FROM settings WHERE key = 'registration_open'").get();
  if (!regOpenRow || regOpenRow.value !== 'true') {
    return res.status(403).json({ error: 'Registration is currently closed' });
  }

  // Validate registration code
  const regCodeRow = db.prepare("SELECT value FROM settings WHERE key = 'registration_code'").get();
  if (!regCodeRow || !regCodeRow.value) {
    return res.status(403).json({ error: 'Registration is currently closed' });
  }
  if (registration_code.trim() !== regCodeRow.value) {
    return res.status(401).json({ error: 'Invalid registration code' });
  }

  // Check username not taken
  const existing = db.prepare("SELECT id FROM access_codes WHERE username = ?").get(usernameClean);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const internalCode = usernameClean.toUpperCase();
  const codeExists = db.prepare("SELECT id FROM access_codes WHERE code = ?").get(internalCode);
  if (codeExists) return res.status(409).json({ error: 'Username already taken' });

  const password_hash = await bcrypt.hash(password, 10);

  // Pick a random icon. With 100+ icons for a typical workshop size, collisions
  // are rare and cosmetic. Avoiding the SELECT here removes a DB round-trip and
  // the race condition that could assign the same icon to concurrent registrations.
  const icon = PARTICIPANT_ICONS[Math.floor(Math.random() * PARTICIPANT_ICONS.length)];

  // Create participant record first (no token yet)
  db.prepare(
    "INSERT INTO access_codes (code, api_key, label, role, username, password_hash, icon) VALUES (?, ?, ?, 'participant', ?, ?, ?)"
  ).run(internalCode, '', usernameClean, usernameClean, password_hash, icon);

  // Create Netskope token group + token for this participant
  let token_group_name = null;
  let token_name = null;
  const { tenant, apiToken: nsApiToken } = ns.getNetskopeConfig();
  if (tenant && nsApiToken) {
    try {
      const groupName = `Participant-Group-${usernameClean}`;
      const tokenNameStr = `Participant-Token-${usernameClean}`;
      const group = await ns.createTokenGroup(tenant, nsApiToken, groupName);
      await new Promise(r => setTimeout(r, 300));
      const expireIn = { value: 30, unit: 'day' };
      const nsToken = await ns.createToken(tenant, nsApiToken, group.id, tokenNameStr, expireIn);
      const tokenValue = nsToken.token || null;
      const expireTime = nsToken.expire_time || null;
      db.prepare(`
        INSERT OR IGNORE INTO api_keys (key, label, netskope_token_group_id, netskope_token_group_name, netskope_token_id, netskope_token_name, netskope_enabled, assigned_to, netskope_expire_time)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(tokenValue, tokenNameStr, group.id, groupName, nsToken.id, tokenNameStr, internalCode, expireTime);
      // Link to participant
      db.prepare("UPDATE access_codes SET api_key = ? WHERE code = ?").run(tokenValue || '', internalCode);
      token_group_name = groupName;
      token_name = tokenNameStr;
    } catch (e) {
      console.error('Netskope token creation failed for', usernameClean, e.message);
      // Registration still succeeds — token can be assigned manually later
    }
  }

  const payload = {
    session_version: SESSION_VERSION,
    code: internalCode,
    role: 'participant',
    username: usernameClean,
    token_group_name,
    token_name,
    icon,
  };

  const jwtToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  res.json({
    token: jwtToken,
    role: 'participant',
    username: usernameClean,
    token_group_name,
    token_name,
    icon,
  });
});

// ── Admin first-login password setup ────────────────────────────────────────
// Sets the password for an admin account that has none yet (fresh install).
// Can only be used while the account has no password — once set, it 409s.
router.post('/admin-setup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (password.length > 64) return res.status(400).json({ error: 'Password must be at most 64 characters' });

  const row = db.prepare("SELECT * FROM access_codes WHERE username = ? AND role = 'admin'").get(username.trim());
  if (!row) return res.status(401).json({ error: 'Admin account not found' });
  if (row.password_hash) return res.status(409).json({ error: 'Admin password already set' });

  const password_hash = await bcrypt.hash(password, 10);
  db.prepare("UPDATE access_codes SET password_hash = ? WHERE id = ?").run(password_hash, row.id);

  const keyInfo = db.prepare('SELECT netskope_token_group_name, netskope_token_name FROM api_keys WHERE key = ?').get(row.api_key);
  const payload = {
    session_version: SESSION_VERSION,
    code: row.code,
    role: row.role,
    username: row.username || null,
    token_group_name: keyInfo?.netskope_token_group_name || null,
    token_name: keyInfo?.netskope_token_name || null,
    icon: row.icon || null,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  res.json({
    token,
    role: row.role,
    username: row.username || null,
    token_group_name: payload.token_group_name,
    token_name: payload.token_name,
    icon: row.icon || null,
  });
});

module.exports = router;
