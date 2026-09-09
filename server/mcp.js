/**
 * MCP server catalogue, shared by the admin routes and the chat proxy.
 *
 * The list is a local cache of the tenant's MCP servers (synced via
 * POST /api/admin/mcp-servers/retrieve) merged with local visibility flags.
 * The chat proxy uses publicMcpUrls() as an allowlist: participants pick a
 * server from a dropdown built server-side, so the URL they send back must be
 * one of these — anything else would let an authenticated participant make the
 * server issue requests to arbitrary hosts.
 */
const db = require('./db');

// Read the locally-cached MCP list, merged with the local visibility flags. The
// ns_id (Netskope UUID) is exposed as `id` so the existing visibility toggles,
// keyed on that UUID, keep working unchanged.
function readLocalMcpServers() {
  const visRows = db.prepare('SELECT mcp_id, visible FROM mcp_visibility').all();
  const visMap = Object.fromEntries(visRows.map(r => [String(r.mcp_id), Number(r.visible)]));
  return db.prepare('SELECT * FROM mcp_servers ORDER BY name ASC').all().map(s => ({
    id: s.ns_id,
    name: s.name,
    schema: s.schema,
    host: s.host,
    port: s.port,
    path: s.path,
    protocol: s.protocol,
    type: s.type,
    visible: visMap[String(s.ns_id)] !== undefined ? visMap[String(s.ns_id)] : 0,
  }));
}

function mcpServerUrl(server) {
  const proto = server.protocol?.replace('-system', '') || 'https';
  return `${proto}://${server.host}:${server.port}${server.path || ''}`;
}

// The participant-visible servers, as {id, name, url}.
function publicMcpServers() {
  return readLocalMcpServers()
    .filter(s => s.visible === 1)
    .map(s => ({ id: s.id, name: s.name, url: mcpServerUrl(s) }));
}

// Allowlist of URLs the chat proxy may forward an MCP call to.
function publicMcpUrls() {
  return new Set(publicMcpServers().map(s => s.url));
}

module.exports = { readLocalMcpServers, mcpServerUrl, publicMcpServers, publicMcpUrls };
