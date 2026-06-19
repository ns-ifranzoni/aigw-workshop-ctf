const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./openapi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/v2/')) {
    res.sendFile(path.join(__dirname, '../public/v2/index.html'));
  } else {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Workshop & CTF All in One running at http://localhost:${PORT}`);
  console.log(`Default admin username: ADMIN-2026 (no default password — set one on first sign-in)`);
});
