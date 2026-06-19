const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { getSetting } = require('../settings-cache');

const router = express.Router();

function providerFromModel(model) {
  if (!model) return 'openai';
  if (model.startsWith('anthropic.') || model.startsWith('meta.') || model.startsWith('amazon.') || model.startsWith('mistral.')) return 'bedrock';
  if (model.startsWith('claude-')) return 'claude';
  if (model.startsWith('deepseek-')) return 'deepseek';
  return 'openai';
}

function visibleProviderKeys() {
  const rows = db.prepare('SELECT name, schema FROM ai_providers WHERE visible = 1').all();
  const keys = new Set();
  for (const row of rows) {
    const schema = (row.schema || '').toLowerCase();
    const name = (row.name || '').toLowerCase();
    if (schema === 'openai' && !name.includes('deepseek')) keys.add('openai');
    if (schema === 'openai' && name.includes('deepseek')) keys.add('deepseek');
    if (schema === 'claude') keys.add('claude');
    if (schema === 'bedrock') keys.add('bedrock');
  }
  return keys;
}

// Get prompt usage for current user
router.post('/participant/config', requireAuth, (req, res) => {
  const { model, provider } = req.body;
  db.prepare('UPDATE access_codes SET preferred_model = ?, preferred_provider = ? WHERE code = ?')
    .run(model || null, provider || null, req.user.code);
  res.json({ ok: true });
});

router.get('/prompt-usage', requireAuth, (req, res) => {
  const row = db.prepare('SELECT prompt_count FROM access_codes WHERE code = ?').get(req.user.code);
  const maxRow = db.prepare("SELECT value FROM settings WHERE key = 'max_prompts'").get();
  res.json({ used: row?.prompt_count || 0, max: parseInt(maxRow?.value || '100', 10) });
});

// Prompt library visible to students (empty when CTF is stopped)
router.get('/prompt-library', requireAuth, (req, res) => {
  const ctfState = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get()?.value || 'stop';
  if (ctfState === 'stop') return res.json([]);
  const rows = db.prepare('SELECT id, text FROM prompt_library WHERE visible = 1 ORDER BY COALESCE(sort_order, id), id').all();
  res.json(rows);
});

// List conversations for current user
router.get('/conversations', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM conversations WHERE access_code = ? ORDER BY updated_at DESC'
  ).all(req.user.code);
  res.json(rows);
});

// Create new conversation
router.post('/conversations', requireAuth, (req, res) => {
  const id = uuidv4();
  const title = req.body.title || 'New conversation';
  db.prepare(
    'INSERT INTO conversations (id, access_code, title) VALUES (?, ?, ?)'
  ).run(id, req.user.code, title);
  res.json({ id, title });
});

// Get messages for a conversation
router.get('/conversations/:id/messages', requireAuth, (req, res) => {
  const conv = db.prepare(
    'SELECT * FROM conversations WHERE id = ? AND access_code = ?'
  ).get(req.params.id, req.user.code);
  if (!conv) return res.status(404).json({ error: 'Not found' });

  const messages = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(messages);
});

// Delete a conversation
router.delete('/conversations/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ? AND access_code = ?').run(req.params.id, req.user.code);
  res.json({ ok: true });
});

// Send message (proxy to AI Gateway)
router.post('/conversations/:id/send', requireAuth, async (req, res) => {
  const ctfState = db.prepare("SELECT value FROM settings WHERE key = 'ctf_state'").get()?.value || 'stop';
  if (ctfState !== 'run') return res.status(403).json({ error: 'ctf_not_running', state: ctfState });
  const { message, model, provider_name, mode, mcp_server, route_mode } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const conv = db.prepare(
    'SELECT * FROM conversations WHERE id = ? AND access_code = ?'
  ).get(req.params.id, req.user.code);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  // Check prompt limit (skip for admins)
  if (req.user.role !== 'admin') {
    const maxRow = db.prepare("SELECT value FROM settings WHERE key = 'max_prompts'").get();
    const maxPrompts = parseInt(maxRow?.value || '100', 10);
    const codeRow = db.prepare('SELECT prompt_count FROM access_codes WHERE code = ?').get(req.user.code);
    const used = codeRow?.prompt_count || 0;
    if (used >= maxPrompts) {
      return res.status(429).json({ error: 'prompt_limit_exceeded', used, max: maxPrompts });
    }
  }

  // Save user message
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
    .run(req.params.id, 'user', message);

  // Update conversation title if it's still default
  if (conv.title === 'New conversation') {
    const title = message.slice(0, 50);
    db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, req.params.id);
  } else {
    db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  }

  // Get full message history for context
  const history = db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  const configuredGatewayUrl = (getSetting('gateway_url') || 'http://localhost:8080').replace(/\/+$/, '');
  const selectedProvider = providerFromModel(model);
  if (mode !== 'mcp' && !visibleProviderKeys().has(selectedProvider)) {
    return res.status(403).json({ error: `${selectedProvider} is disabled by the admin` });
  }

  try {
    let assistantMessage;

    if (mode === 'mcp') {
      // MCP mode: forward to MCP server
      const clientMcpUrl = typeof mcp_server === 'string' ? mcp_server.trim() : '';
      const mcpUrl = clientMcpUrl || configuredGatewayUrl;
      const fetch = (await import('node-fetch')).default;
      const headers = { 'Content-Type': 'application/json' };
      if (!clientMcpUrl) headers.Authorization = `Bearer ${req.user.api_key}`;
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ method: 'tools/call', params: { prompt: message } })
      });
      const data = await response.json();
      assistantMessage = data.result?.content || JSON.stringify(data);
    } else if (route_mode === 'direct') {
      // Direct mode: call provider API directly using ai_providers table
      const fetch = (await import('node-fetch')).default;

      // Look up provider by name sent from frontend
      const providerRow = provider_name
        ? db.prepare('SELECT * FROM ai_providers WHERE name = ? AND visible = 1').get(provider_name)
        : db.prepare('SELECT * FROM ai_providers WHERE schema = ? AND visible = 1 ORDER BY id ASC').get(selectedProvider);

      if (!providerRow) throw new Error(`Provider "${provider_name || selectedProvider}" not found or not enabled`);
      const apiKey = providerRow.api_token;
      const schema = (providerRow.schema || '').toLowerCase();

      if (schema === 'claude') {
        if (!apiKey) throw new Error(`Anthropic API key not configured for provider "${providerRow.name}"`);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model || 'claude-3-5-sonnet-20241022', max_tokens: 4096, messages: history.map(m => ({ role: m.role, content: m.content })) })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Anthropic error');
        assistantMessage = data.content?.[0]?.text || 'No response';

      } else if (schema === 'bedrock') {
        const { createHmac, createHash } = require('crypto');
        const accessKey = getSetting('provider_token_bedrock_key');
        const secretKey = getSetting('provider_token_bedrock_secret');
        const region = getSetting('provider_token_bedrock_region') || 'us-east-1';
        if (!accessKey || !secretKey) throw new Error('Bedrock credentials not configured in admin settings');

        const modelId = model || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
        const host = `bedrock-runtime.${region}.amazonaws.com`;
        const path = `/model/${encodeURIComponent(modelId)}/invoke`;

        let bedrockBody;
        if (modelId.startsWith('anthropic.')) {
          bedrockBody = { anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, messages: history.map(m => ({ role: m.role, content: m.content })) };
        } else {
          bedrockBody = { messages: history.map(m => ({ role: m.role, content: m.content })), max_tokens: 4096 };
        }
        const bodyStr = JSON.stringify(bedrockBody);

        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
        const dateStamp = amzDate.slice(0, 8);
        const payloadHash = createHash('sha256').update(bodyStr).digest('hex');
        const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'content-type;host;x-amz-date';
        const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
        const credScope = `${dateStamp}/${region}/bedrock/aws4_request`;
        const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
        const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
        const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 'bedrock'), 'aws4_request');
        const signature = createHmac('sha256', signingKey).update(strToSign).digest('hex');
        const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const response = await fetch(`https://${host}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-amz-date': amzDate, Authorization: auth },
          body: bodyStr
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Bedrock HTTP ${response.status}`);
        assistantMessage = data.content?.[0]?.text || data.output?.message?.content?.[0]?.text || JSON.stringify(data);

      } else {
        // OpenAI-compatible (openai, deepseek, mistral, etc.)
        if (!apiKey) throw new Error(`API key not configured for provider "${providerRow.name}"`);
        const proto = (providerRow.protocol || 'https').replace(/-system$/, '').replace(/-proxy$/, '');
        const baseUrl = providerRow.host
          ? `${proto}://${providerRow.host}${providerRow.port && providerRow.port !== 443 && providerRow.port !== 80 ? ':' + providerRow.port : ''}${providerRow.path || '/v1'}`
          : 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'gpt-4o', messages: history.map(m => ({ role: m.role, content: m.content })) })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || `${providerRow.name} error`);
        assistantMessage = data.choices?.[0]?.message?.content || 'No response';
      }

    } else {
      // Secured mode: proxy through Netskope AI Gateway
      const fetch = (await import('node-fetch')).default;

      // Get the AI provider's API token and name for the URL and Authorization header
      const providerRow = provider_name
        ? db.prepare('SELECT name, api_token FROM ai_providers WHERE name = ? AND visible = 1').get(provider_name)
        : db.prepare('SELECT name, api_token FROM ai_providers WHERE schema = ? AND visible = 1 ORDER BY id ASC').get(selectedProvider);
      const providerApiToken = providerRow?.api_token || '';
      const providerPath = providerRow?.name ? `/v1/${providerRow.name}` : '';
      const url = `${configuredGatewayUrl}${providerPath}/v1/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ns-aig-apikey': req.user.api_key || '',
          'Authorization': `Bearer ${providerApiToken}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: history.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Gateway error');
      assistantMessage = data.choices?.[0]?.message?.content || 'No response';
    }

    // Save assistant message
    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
      .run(req.params.id, 'assistant', assistantMessage);

    // Increment prompt counter
    if (req.user.role !== 'admin') {
      const col = route_mode === 'direct' ? 'prompt_count_direct' : 'prompt_count_secured';
      db.prepare(`UPDATE access_codes SET prompt_count = prompt_count + 1, ${col} = ${col} + 1 WHERE code = ?`).run(req.user.code);
    }

    // Return updated count
    const updatedRow = db.prepare('SELECT prompt_count FROM access_codes WHERE code = ?').get(req.user.code);
    const maxRow = db.prepare("SELECT value FROM settings WHERE key = 'max_prompts'").get();
    res.json({ message: assistantMessage, prompt_count: updatedRow?.prompt_count || 0, max_prompts: parseInt(maxRow?.value || '100', 10) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Gateway error' });
  }
});

module.exports = router;
