const express = require('express');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { getSetting, setSetting } = require('../settings-cache');
const ns = require('../netskope');
const { participantTokenGroupName, participantTokenGroupId } = require('../participant-tokens');

const router = express.Router();

// ── CTF State ─────────────────────────────────────────────

router.get('/telemetry', (req, res) => {
  const gwRow = db.prepare("SELECT value FROM settings WHERE key = 'gateway_url'").get();
  const gatewayConfigured = !!(gwRow?.value?.trim());

  const participants = db.prepare("SELECT COUNT(*) as c FROM access_codes WHERE role = 'participant'").get().c;
  const challenges = db.prepare("SELECT COUNT(*) as c FROM challenges WHERE visible = 1").get().c;

  const rankingRows = db.prepare(`
    SELECT
      COALESCE(ac.username, cc.participant_code) as name,
      COALESCE(SUM(cc.points_earned), 0) - 5 * COALESCE((
        SELECT COUNT(*) FROM challenge_attempts ca WHERE ca.participant_code = cc.participant_code
      ), 0) as pts
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id AND c.visible = 1
    LEFT JOIN access_codes ac ON ac.code = cc.participant_code
    GROUP BY cc.participant_code
    ORDER BY pts DESC
    LIMIT 3
  `).all();

  const ranking = rankingRows.filter(r => r.pts > 0).map((r, i) => ({ pos: i + 1, name: r.name, pts: r.pts }));

  res.json({
    gateway: gatewayConfigured,
    participants,
    challenges,
    ranking
  });
});

router.get('/registration-status', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_open'").get();
  res.json({ open: row?.value === '1' || row?.value === 'true' });
});

// getSetting / setSetting provided by settings-cache (with 5 s TTL + write invalidation)

// ── Variable interpolation for text challenges ──
function interpolateVariables(text, participantCode, participantApiKey) {
  let result = text;

  // %gateway_url — strip protocol so only the hostname (and optional port) is returned
  const gatewayUrl = (getSetting('gateway_url') || '').replace(/^https?:\/\//, '');
  result = result.replace(/%gateway_url/g, gatewayUrl);

  // %gateway_private_url — same treatment for the private URL (empty = same as public)
  const gatewayPrivateUrl = (getSetting('gateway_url_private') || getSetting('gateway_url') || '').replace(/^https?:\/\//, '');
  result = result.replace(/%gateway_private_url/g, gatewayPrivateUrl);

  // %tokengroup
  const tokenGroup = participantTokenGroupName(participantCode, participantApiKey) || '';
  result = result.replace(/%tokengroup/g, tokenGroup);

  return result;
}

// ── CTF countdown timer ───────────────────────────────────
// Server-authoritative, pausable countdown. The clock only ticks while the CTF
// state is 'run'; Stop/Standby freeze it. Effective remaining is computed from
// absolute timestamps so it survives restarts and stays identical for everyone.
const MAX_TIMER_SECONDS = 10 * 3600; // 10 hours

function getTimerState() {
  const total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
  let remaining = parseFloat(getSetting('ctf_timer_remaining'));
  if (isNaN(remaining)) remaining = total;
  const startedAt = parseInt(getSetting('ctf_timer_started_at') || '0', 10) || 0;
  const state = getSetting('ctf_state') || 'stop';
  const running = startedAt > 0 && state === 'run';
  let eff = running ? remaining - (Date.now() - startedAt) / 1000 : remaining;
  if (eff <= 0) {
    eff = 0;
    if (running) {
      // Lazy expiration: freeze at 0 and auto-pass to Standby.
      setSetting('ctf_timer_remaining', '0');
      setSetting('ctf_timer_started_at', '');
      setSetting('ctf_state', 'standby');
      return { total, remaining: 0, running: false, state: 'standby', expired: true };
    }
  }
  return { total, remaining: Math.round(eff), running, state, expired: false };
}

// Re-anchor the timer whenever the CTF state changes (run = clock ticking).
function applyStateToTimer(newState) {
  const total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
  let remaining = parseFloat(getSetting('ctf_timer_remaining'));
  if (isNaN(remaining)) remaining = total;
  const startedAt = parseInt(getSetting('ctf_timer_started_at') || '0', 10) || 0;
  let eff = (startedAt > 0) ? remaining - (Date.now() - startedAt) / 1000 : remaining;
  if (eff < 0) eff = 0;
  setSetting('ctf_timer_remaining', String(eff));
  setSetting('ctf_timer_started_at', (newState === 'run' && total > 0 && eff > 0) ? String(Date.now()) : '');
}

router.get('/ctf-state', (req, res) => {
  const t = getTimerState();
  res.json({ state: t.state, timer: { total: t.total, remaining: t.remaining, running: t.running, expired: t.expired } });
});

router.post('/ctf-state', requireAdmin, (req, res) => {
  const { state } = req.body;
  if (!['stop', 'standby', 'run'].includes(state)) return res.status(400).json({ error: 'Invalid state' });
  setSetting('ctf_state', state);
  applyStateToTimer(state);
  res.json({ ok: true, state });
});

router.get('/timer', (req, res) => {
  res.json(getTimerState());
});

router.post('/timer', requireAdmin, (req, res) => {
  const { action } = req.body;
  const state = getSetting('ctf_state') || 'stop';
  if (action === 'set') {
    let secs = parseInt(req.body.seconds, 10);
    if (isNaN(secs) || secs < 0) return res.status(400).json({ error: 'Invalid seconds' });
    secs = Math.min(secs, MAX_TIMER_SECONDS);
    setSetting('ctf_timer_total', String(secs));
    setSetting('ctf_timer_remaining', String(secs));
    setSetting('ctf_timer_started_at', (secs > 0 && state === 'run') ? String(Date.now()) : '');
  } else if (action === 'reset') {
    const total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
    setSetting('ctf_timer_remaining', String(total));
    setSetting('ctf_timer_started_at', (total > 0 && state === 'run') ? String(Date.now()) : '');
  } else if (action === 'adjust') {
    const delta = parseInt(req.body.delta, 10) || 0;
    let newRemaining = getTimerState().remaining + delta;
    newRemaining = Math.max(0, Math.min(newRemaining, MAX_TIMER_SECONDS));
    let total = parseInt(getSetting('ctf_timer_total') || '0', 10) || 0;
    if (newRemaining > total) { total = newRemaining; setSetting('ctf_timer_total', String(total)); }
    setSetting('ctf_timer_remaining', String(newRemaining));
    setSetting('ctf_timer_started_at', (newRemaining > 0 && state === 'run') ? String(Date.now()) : '');
  } else if (action === 'clear') {
    setSetting('ctf_timer_total', '0');
    setSetting('ctf_timer_remaining', '0');
    setSetting('ctf_timer_started_at', '');
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
  res.json(getTimerState());
});

// Leaderboard visibility for participants (admins always see it). Default: visible.
function isLeaderboardVisible() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'leaderboard_visible'").get();
  return row?.value !== 'false' && row?.value !== '0'; // missing => visible
}

router.get('/leaderboard-visible', (req, res) => {
  res.json({ visible: isLeaderboardVisible() });
});

router.post('/leaderboard-visible', requireAdmin, (req, res) => {
  const { visible } = req.body;
  db.prepare("INSERT INTO settings (key, value) VALUES ('leaderboard_visible', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(visible ? 'true' : 'false');
  res.json({ ok: true, visible: !!visible });
});

// ── Admin: CRUD ───────────────────────────────────────────

router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM challenges ORDER BY order_num ASC, id ASC').all();
  res.json(rows);
});

// Legacy type values kept for backward compat (challenges already in DB).
const LEGACY_TYPE_MAP = { 'transaction_id': 'event_access', 'dlp': 'event_dlp', 'ai_guardrails': 'event_guardrails' };
const EVENT_CHALLENGE_TYPES = ['event_access', 'event_dlp', 'event_guardrails', 'policy_access', 'policy_dlp', 'policy_guardrails', 'transaction_id', 'dlp', 'ai_guardrails'];
function normalizeChallengeType(t, group) {
  const raw = String(t || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  const normalizedGroup = String(group || '').trim().toLowerCase();
  if (raw === 'text' || normalizedGroup === 'text') return 'text';
  if (LEGACY_TYPE_MAP[raw]) return LEGACY_TYPE_MAP[raw];
  const newTypes = ['event_access', 'event_dlp', 'event_guardrails', 'policy_access', 'policy_dlp', 'policy_guardrails'];
  if (newTypes.includes(raw)) return raw;
  const categoryMap = {
    access: 'access',
    access_control: 'access',
    dlp: 'dlp',
    guardrails: 'guardrails',
    ai_guardrails: 'guardrails',
  };
  const category = categoryMap[raw];
  if (category && normalizedGroup === 'policy') return `policy_${category}`;
  if (category && (normalizedGroup === 'events' || normalizedGroup === 'event')) return `event_${category}`;
  return 'event_access';
}
// Derive transaction category from challenge type suffix.
function typeToTransactionType(t) {
  if (t.endsWith('_dlp')) return 'DLP';
  if (t.endsWith('_guardrails')) return 'Guardrails';
  if (t.endsWith('_access')) return 'Access';
  return null;
}
function typeToGroup(t) {
  if (t === 'text') return 'text';
  if (String(t || '').startsWith('policy_')) return 'policy';
  return 'events';
}

function buildTransactionQuery(activity, gatewayAction, transactionType) {
  const parts = [];
  if (activity) parts.push(`activity eq "${activity}"`);
  if (gatewayAction) {
    const map = { 'Allow': 'allow', 'Alert': 'alert', 'Monitor': 'monitor', 'Block': 'block', 'Replace': 'replace', 'Block; Replace': 'block-replace' };
    parts.push(`policy_action eq "${map[gatewayAction] || gatewayAction}"`);
  }
  if (transactionType) {
    const map = { 'Access': 'access', 'DLP': 'dlp', 'Guardrails': 'guardrails' };
    parts.push(`transaction_category eq "${map[transactionType] || transactionType}"`);
  }
  return parts.join(' AND ');
}

router.post('/', requireAdmin, (req, res) => {
  const { title, description, ns_time_filter, visible, order_num,
          challenge_type, ch_activity, ch_gateway_action, ch_text_key, ch_model, ch_points, hint } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const timeFilter = Math.min(60, Math.max(10, parseInt(ns_time_filter) || 30));
  const type = normalizeChallengeType(challenge_type, req.body.challenge_group);
  const resolvedTxType = req.body.ch_transaction_type || typeToTransactionType(type);
  const ns_query = (type !== 'text' && !type.startsWith('policy_')) ? buildTransactionQuery(ch_activity, ch_gateway_action, resolvedTxType) : '';
  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM challenges').get().m || 0;
  const result = db.prepare(`
    INSERT INTO challenges (title, description, ns_query, ns_event_type, ns_time_filter, visible, order_num,
      challenge_type, ch_activity, ch_gateway_action, ch_transaction_type, ch_text_key, ch_model, ch_points, hint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', ns_query, 'application', timeFilter, visible ? 1 : 0, order_num ?? maxOrder + 1,
         type, ch_activity || null, ch_gateway_action || null, resolvedTxType || null, ch_text_key || null,
         ch_model?.trim() || null, parseInt(ch_points) || 50, hint?.trim() || null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { title, description, ns_time_filter, visible, order_num,
          challenge_type, ch_activity, ch_gateway_action, ch_text_key, ch_model, ch_points, hint } = req.body;
  const current = db.prepare('SELECT order_num FROM challenges WHERE id = ?').get(req.params.id);
  const nextOrder = order_num ?? current?.order_num ?? 0;
  const timeFilter = Math.min(60, Math.max(10, parseInt(ns_time_filter) || 30));
  const type = normalizeChallengeType(challenge_type, req.body.challenge_group);
  const resolvedTxType = req.body.ch_transaction_type || typeToTransactionType(type);
  const ns_query = (type !== 'text' && !type.startsWith('policy_')) ? buildTransactionQuery(ch_activity, ch_gateway_action, resolvedTxType) : '';
  db.prepare(`
    UPDATE challenges SET title=?, description=?, ns_query=?, ns_event_type=?, ns_time_filter=?, visible=?, order_num=?,
      challenge_type=?, ch_activity=?, ch_gateway_action=?, ch_transaction_type=?, ch_text_key=?, ch_model=?, ch_points=?, hint=?
    WHERE id=?
  `).run(title, description || '', ns_query, 'application', timeFilter, visible ? 1 : 0, nextOrder,
         type, ch_activity || null, ch_gateway_action || null, resolvedTxType || null, ch_text_key || null,
         ch_model?.trim() || null, parseInt(ch_points) || 50, hint?.trim() || null, req.params.id);
  res.json({ ok: true });
});

function normalizeChallengeOrder() {
  const rows = db.prepare('SELECT id FROM challenges ORDER BY order_num ASC, id ASC').all();
  const update = db.prepare('UPDATE challenges SET order_num = ? WHERE id = ?');
  const tx = db.transaction(items => {
    items.forEach((row, idx) => update.run(idx + 1, row.id));
  });
  tx(rows);
}

router.post('/reorder', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const update = db.prepare('UPDATE challenges SET order_num = ? WHERE id = ?');
  const tx = db.transaction(() => ids.forEach((id, i) => update.run(i + 1, id)));
  tx();
  res.json({ ok: true });
});

router.delete('/all', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM challenge_completions').run();
  db.prepare('DELETE FROM hint_usage').run();
  db.prepare('DELETE FROM challenges').run();
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM challenge_completions WHERE challenge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM hint_usage WHERE challenge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM challenges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Export CSV
router.get('/export', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM challenges ORDER BY order_num ASC, id ASC').all();
  const header = 'seq,title,description,ns_query,ns_event_type,ns_time_filter,visible,challenge_group,challenge_type,ch_activity,ch_gateway_action,ch_transaction_type,ch_text_key,ch_model,ch_points,hint';
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r, i) => [
    i + 1, esc(r.title), esc(r.description), esc(r.ns_query), esc(r.ns_event_type),
    r.ns_time_filter, r.visible, esc(typeToGroup(r.challenge_type)), esc(r.challenge_type ?? 'transaction_id'),
    esc(r.ch_activity ?? ''), esc(r.ch_gateway_action ?? ''), esc(r.ch_transaction_type ?? ''),
    esc(r.ch_text_key ?? ''), esc(r.ch_model ?? ''), r.ch_points ?? 50, esc(r.hint ?? '')
  ].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="challenges.csv"');
  res.send([header, ...lines].join('\n'));
});

function parseCSVLine(line) {
  const result = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = ''; i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else val += line[i++];
      }
      result.push(val);
      if (line[i] === ',') i++;
    } else {
      let start = i;
      while (i < line.length && line[i] !== ',') i++;
      result.push(line.slice(start, i));
      if (line[i] === ',') i++;
    }
  }
  return result;
}

// Import CSV
router.post('/import', requireAdmin, (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'No CSV provided' });
  const lines = csv.trim().split('\n');
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const idx = k => header.indexOf(k);
  let imported = 0;
  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM challenges').get().m || 0;
  for (let i = 1; i < lines.length; i++) {
    try {
    const cols = parseCSVLine(lines[i]);
    const title = cols[idx('title')]?.trim();
    if (!title) continue;
    const type = normalizeChallengeType(cols[idx('challenge_type')]?.trim(), cols[idx('challenge_group')]?.trim());
    const activity = cols[idx('ch_activity')] || null;
    const gatewayAction = cols[idx('ch_gateway_action')] || null;
    const transactionType = cols[idx('ch_transaction_type')] || typeToTransactionType(type) || null;
    const hasModernConfig = activity || gatewayAction || transactionType || cols[idx('ch_text_key')] || cols[idx('ch_model')];
    const nsQuery = (type !== 'text' && !type.startsWith('policy_'))
      ? (hasModernConfig ? buildTransactionQuery(activity, gatewayAction, transactionType) : (cols[idx('ns_query')] || ''))
      : '';
    db.prepare(`INSERT INTO challenges
      (order_num, title, description, ns_query, ns_event_type, ns_time_filter, visible,
       challenge_type, ch_activity, ch_gateway_action, ch_transaction_type, ch_text_key, ch_model, ch_points, hint)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        parseInt(cols[idx('seq')] || cols[idx('order_num')]) || maxOrder + imported + 1,
        title,
        cols[idx('description')] || '',
        nsQuery,
        cols[idx('ns_event_type')] || 'page',
        parseInt(cols[idx('ns_time_filter')]) || 30,
        parseInt(cols[idx('visible')]) || 0,
        type,
        activity,
        gatewayAction,
        transactionType,
        cols[idx('ch_text_key')] || null,
        cols[idx('ch_model')] || null,
        parseInt(cols[idx('ch_points')]) || 50,
        cols[idx('hint')] || null
      );
    imported++;
    } catch(e) { console.error(`[import] row ${i} error:`, e.message); }
  }
  res.json({ ok: true, imported });
});

// Admin: completions detail for a student
router.get('/participants/:code/completions', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  const completions = db.prepare(`
    SELECT c.id, c.title, c.order_num, cc.completed_at as ts, cc.points_earned, 'success' as result
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id
    WHERE cc.participant_code = ?
  `).all(code);
  const failed = db.prepare(`
    SELECT c.id, c.title, c.order_num, ca.attempted_at as ts, -5 as points_earned, 'fail' as result
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    WHERE ca.participant_code = ? AND ca.is_hint = 0
  `).all(code);
  const hints = db.prepare(`
    SELECT c.id, c.title, c.order_num, hu.used_at as ts, -5 as points_earned, 'hint' as result
    FROM hint_usage hu
    JOIN challenges c ON c.id = hu.challenge_id
    WHERE hu.participant_code = ?
  `).all(code);
  const history = [...completions, ...failed, ...hints].sort((a, b) => (a.ts > b.ts ? 1 : -1));
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  const allAttempts = db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ?').get(code).n;
  const totalPoints = completions.reduce((s, c) => s + (c.points_earned || 0), 0) - allAttempts * 5;
  // Per-challenge summary for the sidebar
  const allChallenges = db.prepare('SELECT id, title, order_num, ch_points, hint FROM challenges WHERE visible = 1 ORDER BY order_num ASC, id ASC').all();
  const completedIds = new Set(completions.map(c => c.id));
  const hintUsedIds = new Set(hints.map(h => h.id));
  const failedCountMap = {};
  failed.forEach(f => { failedCountMap[f.id] = (failedCountMap[f.id] || 0) + 1; });
  const challenges = allChallenges.map(c => ({
    id: c.id,
    title: c.title,
    order_num: c.order_num,
    points: c.ch_points || 50,
    has_hint: !!(c.hint && c.hint.trim()),
    completed: completedIds.has(c.id),
    hint_used: hintUsedIds.has(c.id),
    failed_attempts: failedCountMap[c.id] || 0,
    points_earned: completedIds.has(c.id) ? (completions.find(x => x.id === c.id)?.points_earned || c.ch_points || 50) : null,
  }));
  res.json({ history, total, total_points: totalPoints, challenges });
});

// Reset completions for a student
router.post('/participants/:code/reset', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  db.prepare('DELETE FROM challenge_completions WHERE participant_code = ?').run(code);
  db.prepare('DELETE FROM challenge_attempts WHERE participant_code = ?').run(code);
  db.prepare('DELETE FROM hint_usage WHERE participant_code = ?').run(code);
  res.json({ ok: true });
});

// Reset failed attempts for a specific challenge for a student
router.post('/participants/:code/reset-attempts/:challengeId', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM challenge_attempts WHERE participant_code = ? AND challenge_id = ?')
    .run(req.params.code.toUpperCase(), parseInt(req.params.challengeId));
  res.json({ ok: true });
});

// ── Admin: leaderboard ────────────────────────────────────

router.get('/leaderboard', requireAuth, (req, res) => {
  // Hidden from participants when the instructor has disabled it; admins always see it.
  if (req.user.role !== 'admin' && !isLeaderboardVisible()) {
    return res.json({ total: 0, rows: [], hidden: true });
  }
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  // Rank every participant (not only those with completions) so the leaderboard
  // is a true full ranking — participants with no completions appear at the
  // bottom with their penalty-adjusted score.
  const rows = db.prepare(`
    SELECT
      ac.code AS participant_code,
      ac.icon,
      COUNT(cc.id) AS completed,
      COALESCE(SUM(cc.points_earned), 0) - 5 * COALESCE((
        SELECT COUNT(*) FROM challenge_attempts ca WHERE ca.participant_code = ac.code
      ), 0) AS total_points
    FROM access_codes ac
    LEFT JOIN challenge_completions cc
      ON cc.participant_code = ac.code
      AND cc.challenge_id IN (SELECT id FROM challenges WHERE visible = 1)
    WHERE ac.role != 'admin'
    GROUP BY ac.code
    ORDER BY total_points DESC, completed DESC, MIN(cc.completed_at) ASC
    LIMIT 20
  `).all();
  res.json({ total, rows });
});

router.get('/podium', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  const rows = db.prepare(`
    SELECT
      cc.participant_code,
      ac.icon,
      COUNT(cc.id) as completed,
      COALESCE(SUM(cc.points_earned), 0) - 5 * COALESCE((
        SELECT COUNT(*) FROM challenge_attempts ca WHERE ca.participant_code = cc.participant_code
      ), 0) as total_points
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id AND c.visible = 1
    LEFT JOIN access_codes ac ON ac.code = cc.participant_code
    GROUP BY cc.participant_code
    ORDER BY total_points DESC, MIN(cc.completed_at) ASC
    LIMIT 3
  `).all();
  res.json({ total, rows });
});

// ── Student: list visible challenges with completion state ─

router.get('/participant/history', requireAuth, (req, res) => {
  const code = req.user.code;
  const completions = db.prepare(`
    SELECT c.title, c.order_num, cc.completed_at as ts, cc.points_earned, 'success' as result
    FROM challenge_completions cc
    JOIN challenges c ON c.id = cc.challenge_id
    WHERE cc.participant_code = ?
  `).all(code);
  const failed = db.prepare(`
    SELECT c.title, c.order_num, ca.attempted_at as ts, -5 as points_earned, 'fail' as result
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    WHERE ca.participant_code = ? AND ca.is_hint = 0
  `).all(code);
  const hints = db.prepare(`
    SELECT c.title, c.order_num, hu.used_at as ts, -5 as points_earned, 'hint' as result
    FROM hint_usage hu
    JOIN challenges c ON c.id = hu.challenge_id
    WHERE hu.participant_code = ?
  `).all(code);
  const history = [...completions, ...failed, ...hints].sort((a, b) => (a.ts > b.ts ? 1 : -1));
  const allAttempts = db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ?').get(code).n;
  const totalPoints = completions.reduce((s, c) => s + (c.points_earned || 0), 0) - allAttempts * 5;
  const completedCount = completions.length;
  const total = db.prepare('SELECT COUNT(*) as n FROM challenges WHERE visible = 1').get().n;
  const hintsCount = hints.length;
  const failedCount = failed.length;
  res.json({ history, total_points: totalPoints, completed: completedCount, total, hints_used: hintsCount, failed_attempts: failedCount });
});

router.post('/participant/:id/hint', requireAuth, (req, res) => {
  const ctfState = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get()?.value || 'stop';
  if (ctfState !== 'run') return res.status(403).json({ error: 'ctf_not_running', state: ctfState });
  const code = req.user.code;
  const challengeId = parseInt(req.params.id);
  const challenge = db.prepare('SELECT id, hint FROM challenges WHERE id = ? AND visible = 1').get(challengeId);
  if (!challenge || !challenge.hint) return res.status(404).json({ error: 'No hint available' });
  const alreadyUsed = db.prepare('SELECT id FROM hint_usage WHERE participant_code = ? AND challenge_id = ?').get(code, challengeId);
  if (alreadyUsed) return res.json({ hint: challenge.hint, already_used: true });
  // First use: record and apply -5 penalty
  db.prepare('INSERT OR IGNORE INTO hint_usage (participant_code, challenge_id) VALUES (?, ?)').run(code, challengeId);
  db.prepare('INSERT INTO challenge_attempts (participant_code, challenge_id, is_hint) VALUES (?, ?, 1)').run(code, challengeId);
  res.json({ hint: challenge.hint, already_used: false });
});

router.get('/participant', requireAuth, (req, res) => {
  const code = req.user.code;
  const ctfStateRow = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get();
  const ctfState = ctfStateRow?.value || 'stop';
  if (ctfState === 'stop') {
    return res.json({ ctf_state: 'stop', challenges: [], total_points: 0, attempt_count: 0, max_retries: null });
  }
  const challenges = db.prepare('SELECT * FROM challenges WHERE visible = 1 ORDER BY order_num ASC, id ASC').all();
  const completions = db.prepare('SELECT challenge_id, completed_at, points_earned FROM challenge_completions WHERE participant_code = ?').all(code);
  const completedMap = Object.fromEntries(completions.map(c => [c.challenge_id, { completed_at: c.completed_at, points_earned: c.points_earned }]));
  const attemptCount = db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ?').get(code).n;
  const totalPointsEarned = completions.reduce((sum, c) => sum + (c.points_earned || 0), 0);
  const totalPoints = totalPointsEarned - attemptCount * 5;
  const maxRetries = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'max_retries'").get()?.value) || 0;
  const COOLDOWN_MS = 5 * 60 * 1000;
  const attemptsPerChallenge = db.prepare(
    'SELECT challenge_id, COUNT(*) as n, MAX(attempted_at) as last_at FROM challenge_attempts WHERE participant_code = ? AND (is_hint IS NULL OR is_hint = 0) GROUP BY challenge_id'
  ).all(code);
  const attemptsMap = Object.fromEntries(attemptsPerChallenge.map(r => [r.challenge_id, { n: r.n, last_at: r.last_at }]));

  // Auto-reset attempts whose cooldown has expired
  for (const [challengeId, info] of Object.entries(attemptsMap)) {
    if (maxRetries > 0 && info.n >= maxRetries) {
      const elapsed = Date.now() - new Date(info.last_at).getTime();
      if (elapsed >= COOLDOWN_MS) {
        db.prepare('DELETE FROM challenge_attempts WHERE participant_code = ? AND challenge_id = ?').run(code, parseInt(challengeId));
        attemptsMap[challengeId] = { n: 0, last_at: null };
      }
    }
  }

  const hintUsed = new Set(
    db.prepare('SELECT challenge_id FROM hint_usage WHERE participant_code = ?').all(code).map(r => r.challenge_id)
  );
  res.json({
    ctf_state: ctfState,
    challenges: challenges.map(c => {
      const info = attemptsMap[c.id] || { n: 0, last_at: null };
      const failed = info.n;
      const inCooldown = maxRetries > 0 && !completedMap[c.id] && failed >= maxRetries;
      const cooldown_until = inCooldown ? new Date(new Date(info.last_at).getTime() + COOLDOWN_MS).toISOString() : null;
      const retries_left = maxRetries > 0 ? Math.max(0, maxRetries - failed) : null;
      return {
        ...c,
        hint: hintUsed.has(c.id) ? c.hint : undefined,
        has_hint: !!(c.hint && c.hint.trim()),
        hint_used: hintUsed.has(c.id),
        completed: !!completedMap[c.id],
        completed_at: completedMap[c.id]?.completed_at || null,
        points_earned: completedMap[c.id]?.points_earned || null,
        failed_attempts: failed,
        retries_left,
        locked: inCooldown,
        cooldown_until,
      };
    }),
    total_points: totalPoints,
    attempt_count: attemptCount,
    max_retries: maxRetries || null,
  });
});

// ── Policy challenge verification ─────────────────────────
// The three policy challenge types differ only in which rule endpoint they
// query; the match criteria are identical.
const POLICY_RULE_PATHS = {
  policy_access: '/api/v2/policy/aig/access/rules',
  policy_dlp: '/api/v2/policy/aig/dlp/rules',
  policy_guardrails: '/api/v2/policy/aig/aiguardrails/rules',
};

function ruleMatchesChallenge(rule, challenge, tokenGroupId) {
  // Must match participant's token group
  if (tokenGroupId && !(rule.criteria?.token_group_ids || []).includes(tokenGroupId)) return false;
  // Must match configured activity (UI value lowercased)
  if (challenge.ch_activity) {
    const act = challenge.ch_activity.toLowerCase();
    if (!(rule.criteria?.activities || []).includes(act)) return false;
  }
  // Must match configured action (UI value lowercased)
  if (challenge.ch_gateway_action) {
    const action = challenge.ch_gateway_action.toLowerCase();
    if (rule.actions?.rule_action?.action_name !== action) return false;
  }
  // Must match configured model in match_values (if set)
  if (challenge.ch_model) {
    const model = challenge.ch_model.trim();
    const modelMatch = (rule.criteria?.ai_provider_models || []).some(m =>
      (m.match_values || []).includes(model)
    );
    if (!modelMatch) return false;
  }
  return true;
}

// Student: check a challenge
router.post('/participant/:id/check', requireAuth, async (req, res) => {
  const ctfState = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get()?.value || 'stop';
  if (ctfState !== 'run') return res.status(403).json({ error: 'ctf_not_running', state: ctfState });

  const code = req.user.code;
  const challengeId = parseInt(req.params.id);

  // Already completed?
  const existing = db.prepare('SELECT id FROM challenge_completions WHERE participant_code = ? AND challenge_id = ?').get(code, challengeId);
  if (existing) return res.json({ found: true, already: true });

  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ? AND visible = 1').get(challengeId);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

  // Check max retries with cooldown (per challenge per student)
  const maxRetries = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'max_retries'").get()?.value) || 0;
  const COOLDOWN_MS = 5 * 60 * 1000;
  if (maxRetries > 0) {
    const attRow = db.prepare('SELECT COUNT(*) as n, MAX(attempted_at) as last_at FROM challenge_attempts WHERE participant_code = ? AND challenge_id = ? AND (is_hint IS NULL OR is_hint = 0)').get(code, challengeId);
    const failedAttempts = attRow.n;
    if (failedAttempts >= maxRetries) {
      const elapsed = Date.now() - new Date(attRow.last_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const cooldown_until = new Date(new Date(attRow.last_at).getTime() + COOLDOWN_MS).toISOString();
        return res.status(429).json({ error: 'cooldown', retries_left: 0, cooldown_until, max_retries: maxRetries });
      }
      // Cooldown expired — reset attempts for this challenge
      db.prepare('DELETE FROM challenge_attempts WHERE participant_code = ? AND challenge_id = ? AND (is_hint IS NULL OR is_hint = 0)').run(code, challengeId);
    }
  }
  const failedAttempts = maxRetries > 0
    ? db.prepare('SELECT COUNT(*) as n FROM challenge_attempts WHERE participant_code = ? AND challenge_id = ? AND (is_hint IS NULL OR is_hint = 0)').get(code, challengeId).n
    : 0;

  try {
    let found = false;

    if (challenge.challenge_type === 'text') {
      // ── Text: keyword match ──────────────────────────────
      let keyword = (challenge.ch_text_key || '').trim();
      if (!keyword) return res.status(400).json({ error: 'Challenge has no text key configured' });
      keyword = interpolateVariables(keyword, code, req.user.api_key);
      const { participant_text } = req.body;
      const input = (participant_text || '').trim();
      found = input.toLowerCase().includes(keyword.toLowerCase());

    } else if (POLICY_RULE_PATHS[challenge.challenge_type]) {
      // ── Policy · Access Control / DLP / Guardrails: verify a matching rule exists ──
      const tenant = db.prepare("SELECT value FROM settings WHERE key = 'netskope_tenant'").get()?.value;
      const apiToken = db.prepare("SELECT value FROM settings WHERE key = 'netskope_api_token'").get()?.value;
      if (!tenant || !apiToken) return res.status(400).json({ error: 'Netskope not configured' });

      // Get the participant's token group ID
      const tokenGroupId = participantTokenGroupId(code, req.user.api_key);

      const baseUrl = `https://${tenant.replace(/^https?:\/\//, '')}`;
      // nsFetch retries on 429 and throws on any other error response, so a
      // rate-limited or failing tenant surfaces as a 502 instead of silently
      // looking like an empty rule list (which would penalise the participant).
      const rulesData = await ns.nsFetch(`${baseUrl}${POLICY_RULE_PATHS[challenge.challenge_type]}`, {
        headers: { 'Content-Type': 'application/json', 'Netskope-Api-Token': apiToken }
      });

      found = (rulesData.elements || []).some(rule => ruleMatchesChallenge(rule, challenge, tokenGroupId));

    } else {
      // ── Events (event_*): query the AI Gateway events API ──
      const tenant = db.prepare("SELECT value FROM settings WHERE key = 'netskope_tenant'").get()?.value;
      const apiToken = db.prepare("SELECT value FROM settings WHERE key = 'netskope_api_token'").get()?.value;
      if (!tenant || !apiToken) return res.status(400).json({ error: 'Netskope not configured' });

      // Use the token group name stored when the token was created. Rebuilding
      // it from the participant code breaks the match: the code is uppercased
      // while the group is created with the username as typed, and admins can
      // choose a custom prefix on bulk creation.
      const tokenGroupName = participantTokenGroupName(code, req.user.api_key);
      if (!tokenGroupName) {
        // Configuration problem, not a wrong answer — return before any penalty.
        return res.status(409).json({ error: 'no_token_group' });
      }

      const baseUrl = `https://${tenant.replace(/^https?:\/\//, '')}`;
      const queryParts = [];
      if (challenge.ns_query) queryParts.push(challenge.ns_query);
      queryParts.push(`x_ai_token_group eq ${tokenGroupName}`);
      const query = queryParts.join(' and ');

      const now = Math.floor(Date.now() / 1000);
      const lookbackMinutes = challenge.ns_time_filter || 30;
      const startTime = now - (lookbackMinutes * 60);

      const params = new URLSearchParams({ query, start_time: startTime, end_time: now });
      const eventsData = await ns.nsFetch(`${baseUrl}/api/v2/events/datasearch/aig?${params}`, {
        headers: { 'accept': 'application/json', 'Authorization': `Bearer ${apiToken}` }
      });
      found = (eventsData.result || []).length > 0;
    }

    if (found) {
      const points = challenge.ch_points || 50;
      try {
        db.prepare('INSERT INTO challenge_completions (participant_code, challenge_id, points_earned) VALUES (?, ?, ?)').run(code, challengeId, points);
      } catch {}
      res.json({ found: true, points_earned: points });
    } else {
      db.prepare('INSERT INTO challenge_attempts (participant_code, challenge_id) VALUES (?, ?)').run(code, challengeId);
      const newFailed = failedAttempts + 1;
      const retries_left = maxRetries > 0 ? Math.max(0, maxRetries - newFailed) : null;
      const inCooldown = maxRetries > 0 && newFailed >= maxRetries;
      const cooldown_until = inCooldown
        ? new Date(Date.now() + COOLDOWN_MS).toISOString()
        : null;
      res.json({ found: false, penalty: -5, retries_left, cooldown_until, max_retries: maxRetries || null });
    }
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
