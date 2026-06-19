const db = require('./db');

const RATE_DELAY_MS = 260; // 4 req/s limit → 250ms min, 260ms to be safe

function getNetskopeConfig() {
  const tenant = db.prepare("SELECT value FROM settings WHERE key = 'netskope_tenant'").get()?.value;
  const apiToken = db.prepare("SELECT value FROM settings WHERE key = 'netskope_api_token'").get()?.value;
  return { tenant, apiToken };
}

function netskopeHeaders(apiToken) {
  return { 'Content-Type': 'application/json', 'Netskope-Api-Token': apiToken };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch with automatic retry on 429, respecting RateLimit-Reset header
async function nsFetch(url, options, retries = 3) {
  const fetch = (await import('node-fetch')).default;
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const resetSecs = parseInt(res.headers.get('RateLimit-Reset') || '1', 10);
      const waitMs = (resetSecs + 1) * 1000; // +1s safety margin
      console.warn(`[Netskope] Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`);
      await sleep(waitMs);
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Netskope ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  }
  throw new Error('Netskope rate limit exceeded after retries');
}

async function listTokenGroups(tenant, apiToken) {
  return nsFetch(`https://${tenant}/api/v2/aig/tokengroups`, { headers: netskopeHeaders(apiToken) });
}

async function listTokens(tenant, apiToken) {
  return nsFetch(`https://${tenant}/api/v2/aig/tokens`, { headers: netskopeHeaders(apiToken) });
}

async function createTokenGroup(tenant, apiToken, name, description = '') {
  return nsFetch(`https://${tenant}/api/v2/aig/tokengroups`, {
    method: 'POST',
    headers: netskopeHeaders(apiToken),
    body: JSON.stringify({ name, description })
  });
}

// expire_in: { value: 24, unit: "hour" } — unit can be hour/day
async function createToken(tenant, apiToken, tokenGroupId, name, expireIn = null) {
  const body = { token_group_id: tokenGroupId, name, enabled: true };
  if (expireIn) body.expire_in = expireIn;
  const data = await nsFetch(`https://${tenant}/api/v2/aig/tokens`, {
    method: 'POST',
    headers: netskopeHeaders(apiToken),
    body: JSON.stringify(body)
  });
  // The actual token JWT is in data.token
  return data;
}

// Generate timestamp string: YY-MM-DD-HH-MM-SS
function tsNow() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return [
    String(now.getUTCFullYear()).slice(2),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds())
  ].join('-');
}

// Generate the list of names that a bulk creation would produce
function bulkNames(prefix, startNumber, count) {
  const names = [];
  for (let i = 0; i < count; i++) {
    const name = `${prefix}${startNumber + i}`;
    names.push(name);
  }
  return names;
}

// Check which of the given names already exist as token groups in Netskope
async function checkDuplicateNames(tenant, apiToken, names) {
  const data = await listTokenGroups(tenant, apiToken);
  const existing = new Set((data.elements || []).map(g => g.name));
  return names.filter(n => existing.has(n));
}

// Create N token groups + tokens in bulk with custom naming
// groupPrefix: e.g. "Student-Group-", tokenPrefix: e.g. "Student-Token-", startNumber: e.g. 1
async function createBulkParticipantTokens(tenant, apiToken, count, expireIn = null, groupPrefix = 'Participant-Group-', tokenPrefix = 'Participant-Token-', startNumber = 1) {
  const results = [];

  for (let i = 0; i < count; i++) {
    const groupName = `${groupPrefix}${startNumber + i}`;
    const tokenName = `${tokenPrefix}${startNumber + i}`;

    try {
      const group = await createTokenGroup(tenant, apiToken, groupName);
      await sleep(RATE_DELAY_MS);
      const token = await createToken(tenant, apiToken, group.id, tokenName, expireIn);
      results.push({
        group,
        token,
        token_value: token.token || null,
        group_name: groupName,
        token_name: tokenName,
        expire_time: token.expire_time || null
      });
      await sleep(RATE_DELAY_MS);
    } catch (err) {
      results.push({ error: err.message, group_name: groupName, token_name: tokenName });
    }
  }
  return results;
}

async function deleteToken(tenant, apiToken, tokenId) {
  await nsFetch(`https://${tenant}/api/v2/aig/tokens/${tokenId}`, {
    method: 'DELETE',
    headers: netskopeHeaders(apiToken)
  });
  return true;
}

async function deleteTokenGroup(tenant, apiToken, groupId) {
  await nsFetch(`https://${tenant}/api/v2/aig/tokengroups/${groupId}`, {
    method: 'DELETE',
    headers: netskopeHeaders(apiToken)
  });
  return true;
}

module.exports = { getNetskopeConfig, listTokenGroups, listTokens, createTokenGroup, createToken, createBulkParticipantTokens, bulkNames, checkDuplicateNames, deleteToken, deleteTokenGroup };
