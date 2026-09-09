const Database = require('better-sqlite3');
const path = require('path');
const { PARTICIPANT_ICONS } = require('./constants');

const dataDir = path.join(__dirname, '../data');
require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'data.db'));

// WAL mode: allows concurrent readers + one writer without blocking each other.
// NORMAL sync is safe under WAL and significantly faster than FULL.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS access_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    api_key TEXT NOT NULL,
    label TEXT,
    role TEXT NOT NULL DEFAULT 'participant',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    access_code TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New conversation',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (access_code) REFERENCES access_codes(code)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT,
    label TEXT,
    assigned_to TEXT,
    netskope_token_group_id TEXT,
    netskope_token_group_name TEXT,
    netskope_token_id TEXT UNIQUE,
    netskope_token_name TEXT,
    netskope_enabled INTEGER DEFAULT 1,
    netskope_expire_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prompt_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mcp_visibility (
    mcp_id TEXT PRIMARY KEY,
    visible INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS ai_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ns_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    schema TEXT,
    host TEXT,
    port INTEGER,
    protocol TEXT,
    type TEXT,
    api_token TEXT,
    visible INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_num INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    ns_query TEXT NOT NULL DEFAULT '',
    ns_event_type TEXT NOT NULL DEFAULT 'page',
    ns_time_filter INTEGER NOT NULL DEFAULT 30,
    visible INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS challenge_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_code TEXT NOT NULL,
    challenge_id INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant_code, challenge_id)
  );
`);

// Performance indexes — created with IF NOT EXISTS so they're idempotent on restart.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_completions_participant    ON challenge_completions(participant_code);
  CREATE INDEX IF NOT EXISTS idx_completions_challenge      ON challenge_completions(challenge_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation      ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_access_code  ON conversations(access_code);
`);

// Migrate: rebuild api_keys if key column still has UNIQUE NOT NULL (old schema)
const colInfo = db.prepare("PRAGMA table_info(api_keys)").all();
const keyCol = colInfo.find(c => c.name === 'key');
if (keyCol && keyCol.notnull === 1) {
  db.exec(`
    CREATE TABLE api_keys_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT,
      label TEXT,
      assigned_to TEXT,
      netskope_token_group_id TEXT,
      netskope_token_group_name TEXT,
      netskope_token_id TEXT UNIQUE,
      netskope_token_name TEXT,
      netskope_enabled INTEGER DEFAULT 1,
      netskope_expire_time TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO api_keys_new SELECT id, NULLIF(key,''), label, assigned_to,
      netskope_token_group_id, netskope_token_group_name, netskope_token_id,
      netskope_token_name, netskope_enabled, netskope_expire_time, created_at
    FROM api_keys;
    DROP TABLE api_keys;
    ALTER TABLE api_keys_new RENAME TO api_keys;
  `);
}

// Add missing columns on older installs
try { db.exec(`ALTER TABLE api_keys ADD COLUMN netskope_token_group_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE api_keys ADD COLUMN netskope_token_group_name TEXT`); } catch {}
try { db.exec(`ALTER TABLE api_keys ADD COLUMN netskope_token_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE api_keys ADD COLUMN netskope_token_name TEXT`); } catch {}
try { db.exec(`ALTER TABLE api_keys ADD COLUMN netskope_enabled INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE api_keys ADD COLUMN netskope_expire_time TEXT`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN prompt_count INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN prompt_count_secured INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN prompt_count_direct INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE prompt_library ADD COLUMN visible INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN challenge_type TEXT NOT NULL DEFAULT 'transaction_id'`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN ch_activity TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN ch_gateway_action TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN ch_transaction_type TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN ch_text_key TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN ch_model TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN ch_points INTEGER NOT NULL DEFAULT 50`); } catch {}
try { db.exec(`ALTER TABLE challenge_completions ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 50`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS challenge_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_code TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_attempts_participant ON challenge_attempts(participant_code);
  CREATE INDEX IF NOT EXISTS idx_attempts_part_ch     ON challenge_attempts(participant_code, challenge_id);
`);
try { db.exec(`ALTER TABLE prompt_library ADD COLUMN sort_order INTEGER`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN icon TEXT`); } catch {}
try { db.exec(`ALTER TABLE challenges ADD COLUMN hint TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE challenge_attempts ADD COLUMN is_hint INTEGER NOT NULL DEFAULT 0`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS hint_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_code TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(participant_code, challenge_id)
)`);
try { db.exec(`ALTER TABLE access_codes ADD COLUMN username TEXT`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN password_hash TEXT`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN preferred_model TEXT`); } catch {}
try { db.exec(`ALTER TABLE access_codes ADD COLUMN preferred_provider TEXT`); } catch {}
try { db.exec(`ALTER TABLE ai_providers ADD COLUMN models TEXT DEFAULT NULL`); } catch {}

// mcp_servers: previously fetched live from the tenant on every load. Cache it
// locally (synced on demand) like ai_providers. The legacy schema only had
// name/url and lacks ns_id + detail columns, so rebuild it. The table is unused
// and empty until the first sync, so dropping it is safe.
try {
  const mcpCols = db.prepare("PRAGMA table_info(mcp_servers)").all();
  if (!mcpCols.some(c => c.name === 'ns_id')) {
    db.exec('DROP TABLE IF EXISTS mcp_servers');
    db.exec(`CREATE TABLE mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ns_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      schema TEXT,
      host TEXT,
      port INTEGER,
      path TEXT,
      protocol TEXT,
      type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
} catch {}

// Assign a random fun icon to any participant that doesn't have one yet
try {
  const participantsWithoutIcon = db.prepare("SELECT id FROM access_codes WHERE role = 'participant' AND (icon IS NULL OR icon = '')").all();
  const updateIcon = db.prepare('UPDATE access_codes SET icon = ? WHERE id = ?');
  const tx = db.transaction(rows => {
    const usedIcons = new Set(
      db.prepare("SELECT icon FROM access_codes WHERE role = 'participant' AND icon IS NOT NULL AND icon != ''").all().map(r => r.icon)
    );
    rows.forEach(row => {
      const available = PARTICIPANT_ICONS.filter(i => !usedIcons.has(i));
      const pool = available.length > 0 ? available : PARTICIPANT_ICONS;
      const icon = pool[Math.floor(Math.random() * pool.length)];
      usedIcons.add(icon);
      updateIcon.run(icon, row.id);
    });
  });
  tx(participantsWithoutIcon);
} catch {}
try {
  const rows = db.prepare('SELECT id, sort_order FROM prompt_library ORDER BY created_at DESC, id DESC').all();
  const updatePromptOrder = db.prepare('UPDATE prompt_library SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(items => {
    items.forEach((row, idx) => {
      if (row.sort_order == null) updatePromptOrder.run(idx + 1, row.id);
    });
  });
  tx(rows);
} catch {}

// Seed defaults
const mp = db.prepare("SELECT * FROM settings WHERE key = 'max_prompts'").get();
if (!mp) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('max_prompts', '100');
const mr = db.prepare("SELECT * FROM settings WHERE key = 'max_retries'").get();
if (!mr) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('max_retries', '5');
db.prepare("INSERT INTO settings (key, value) VALUES ('ctf_state', 'stop') ON CONFLICT(key) DO UPDATE SET value = 'stop'").run();

// Default CTF countdown: 2 hours. Seeded only when absent so an existing
// configured timer is preserved across restarts.
const DEFAULT_CTF_TIMER_SECONDS = 2 * 3600;
const _timerTotal = db.prepare("SELECT value FROM settings WHERE key = 'ctf_timer_total'").get();
if (!_timerTotal) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('ctf_timer_total', ?)").run(String(DEFAULT_CTF_TIMER_SECONDS));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ctf_timer_remaining', ?)").run(String(DEFAULT_CTF_TIMER_SECONDS));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ctf_timer_started_at', '')").run();
}

// Default self-registration code. Seeded only when absent so a custom code set
// by an admin is preserved across restarts.
const _regCode = db.prepare("SELECT value FROM settings WHERE key = 'registration_code'").get();
if (!_regCode) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('registration_code', 'clouddefenders2026')").run();
}

// JWT secret: env var > DB > auto-generate and persist
const _jwtRow = db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get();
if (!_jwtRow) {
  const generated = require('crypto').randomBytes(48).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)").run(generated);
}
const JWT_SECRET = process.env.JWT_SECRET || db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get().value;
const gw = db.prepare("SELECT * FROM settings WHERE key = 'gateway_url'").get();
if (!gw) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('gateway_url', 'http://aigateway.lab:8080');

// Default admin: created WITHOUT a password. On first login the portal
// detects the empty password_hash and prompts to set one (see routes/auth.js
// admin-setup). This avoids shipping a known default credential.
// The API token is generated per install for the same reason — middleware/auth
// accepts an admin api_key as a bearer token, so a fixed value in the public
// repo would be a full authentication bypass. Read it in Admin → Admins.
const admin = db.prepare("SELECT * FROM access_codes WHERE role = 'admin' LIMIT 1").get();
if (!admin) {
  db.prepare("INSERT INTO access_codes (code, api_key, label, role, username, password_hash) VALUES (?, ?, ?, ?, ?, NULL)").run(
    'ADMIN-2026', require('crypto').randomBytes(24).toString('hex'), 'Administrator', 'admin', 'ADMIN-2026'
  );
} else if (admin.username == null) {
  // Legacy admin without a username: backfill it from the code, but leave the
  // password as-is (null → first-login setup; existing hash → keep working).
  db.prepare("UPDATE access_codes SET username = code WHERE role = 'admin' AND username IS NULL").run();
}

// Migrate: rotate the legacy hardcoded default admin API token. Older installs
// seeded api_key = 'admin-key', a value published in the repo that grants full
// admin access through middleware/auth. Idempotent: only rows still holding it.
try {
  const legacyAdmins = db.prepare("SELECT id FROM access_codes WHERE role = 'admin' AND api_key = 'admin-key'").all();
  const rotate = db.prepare('UPDATE access_codes SET api_key = ? WHERE id = ?');
  for (const row of legacyAdmins) {
    rotate.run(require('crypto').randomBytes(24).toString('hex'), row.id);
  }
  if (legacyAdmins.length) {
    console.warn(`[security] Rotated ${legacyAdmins.length} admin API token(s) that still used the default value. Read the new token in Admin → Admins.`);
  }
} catch (e) { console.error('Migration admin api_key rotation:', e.message); }

// Migrate: rename student_code → participant_code in challenge_completions
try {
  const cols = db.prepare("PRAGMA table_info(challenge_completions)").all();
  if (cols.find(c => c.name === 'student_code')) {
    db.exec(`
      CREATE TABLE challenge_completions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_code TEXT NOT NULL,
        challenge_id INTEGER NOT NULL,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        points_earned INTEGER NOT NULL DEFAULT 50,
        UNIQUE(participant_code, challenge_id)
      );
      INSERT INTO challenge_completions_new SELECT id, student_code, challenge_id, completed_at, points_earned FROM challenge_completions;
      DROP TABLE challenge_completions;
      ALTER TABLE challenge_completions_new RENAME TO challenge_completions;
    `);
  }
} catch(e) { console.error('Migration challenge_completions:', e.message); }

// Migrate: rename student_code → participant_code in challenge_attempts
try {
  const cols2 = db.prepare("PRAGMA table_info(challenge_attempts)").all();
  if (cols2.find(c => c.name === 'student_code')) {
    db.exec(`
      CREATE TABLE challenge_attempts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_code TEXT NOT NULL,
        challenge_id INTEGER NOT NULL,
        attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO challenge_attempts_new SELECT id, student_code, challenge_id, attempted_at FROM challenge_attempts;
      DROP TABLE challenge_attempts;
      ALTER TABLE challenge_attempts_new RENAME TO challenge_attempts;
    `);
  }
} catch(e) { console.error('Migration challenge_attempts:', e.message); }

// Migrate: update role value 'student' → 'participant' in access_codes
try {
  db.prepare("UPDATE access_codes SET role = 'participant' WHERE role = 'student'").run();
} catch(e) {}

// Migrate: fix stale template URLs that still point to the old repo name
// (aigwworkshopctf → aigw-workshop-ctf, renamed when the project went public).
try {
  const OLD_REPO = 'ns-ifranzoni/aigwworkshopctf';
  const NEW_REPO = 'ns-ifranzoni/aigw-workshop-ctf';
  const templateKeys = ['prompt_library_template_url', 'challenges_template_url'];
  for (const key of templateKeys) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row && row.value.includes(OLD_REPO)) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?')
        .run(row.value.replace(OLD_REPO, NEW_REPO), key);
    }
  }
} catch(e) {}

module.exports = db;
module.exports.JWT_SECRET = JWT_SECRET;
