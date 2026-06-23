const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./openapi');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Structured request logging (skip /api/health to avoid noise)
app.use(pinoHttp({ logger, autoLogging: false }));

// CORS: allow only the explicitly configured origin (defaults to same-origin / disabled).
// Set ALLOWED_ORIGIN=https://your-domain.com when the API is accessed from a different host.
const corsOrigin = process.env.ALLOWED_ORIGIN || false;
app.use(cors({ origin: corsOrigin }));

// Gzip/brotli compression for all responses — most impactful for large JS/CSS assets.
app.use(compression());

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/challenges', require('./routes/challenges'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Workshop & CTF All in One API Documentation' }));

// Public endpoint: students read the global gateway URL
const db = require('./db');
const ns = require('./netskope');
const { requireAuth } = require('./middleware/auth');

function gatewayHostFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  }
}

// Authenticated endpoint: students read AI Gateway next sync info
app.get('/api/settings/ai-gateway-sync', requireAuth, async (req, res) => {
  const { tenant, apiToken } = ns.getNetskopeConfig();
  if (!tenant || !apiToken) return res.json({ last_sync_time: null });
  const gatewayUrl = db.prepare("SELECT value FROM settings WHERE key = 'gateway_url'").get()?.value || '';
  const configuredHost = gatewayHostFromUrl(gatewayUrl);
  if (!configuredHost) return res.json({ last_sync_time: null });
  try {
    const data = await ns.listAppliances(tenant, apiToken);
    const appliance = (data.elements || []).find(a => String(a.host || '').trim().toLowerCase() === configuredHost);
    res.json({ last_sync_time: appliance?.last_sync_time || null });
  } catch {
    res.json({ last_sync_time: null });
  }
});

app.get('/api/settings/gateway-url', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'gateway_url'").get();
  res.json({ gateway_url: row?.value || '' });
});

app.get('/api/settings/tenant', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'netskope_tenant'").get();
  res.json({ tenant: row?.value || '' });
});

app.get('/api/settings/aiproviders', (req, res) => {
  const rows = db.prepare('SELECT id, name, schema, host, port FROM ai_providers WHERE visible = 1 ORDER BY id ASC').all();
  res.json(rows);
});

// Serve v2 interface
app.get('/v2', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/v2/index.html'));
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/v2/')) {
    res.sendFile(path.join(__dirname, '../public/v2/index.html'));
  } else {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

app.listen(PORT, () => {
  logger.info(`Workshop & CTF All in One running at http://localhost:${PORT}`);
  logger.info('Default admin username: ADMIN-2026 (no default password — set one on first sign-in)');
});
