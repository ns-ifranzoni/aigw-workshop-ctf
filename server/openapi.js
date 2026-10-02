const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Workshop & CTF All in One API Documentation',
      version: '1.1.0',
      description: `REST API for the Netskope AI Gateway Workshop portal.

**How to authenticate:**

Click the **Authorize** button (🔓) and paste your **Admin API Token** (found in Admin → Admins → Token column).

Alternatively, call \`POST /auth/login\` to get a JWT and use that instead.`,
    },
    servers: [{ url: '/api', description: 'Local server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        Ok: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Login, register, session' },
      { name: 'Chat', description: 'Participant chat and conversations' },
      { name: 'Challenges', description: 'CTF challenges (participant)' },
      { name: 'Admin – Codes', description: 'Participant access code management' },
      { name: 'Admin – Admins', description: 'Admin account management' },
      { name: 'Admin – Prompts', description: 'Prompt library' },
      { name: 'Admin – AI Providers', description: 'AI provider configuration' },
      { name: 'Admin – Challenges', description: 'Challenge management' },
      { name: 'Admin – Settings', description: 'Portal settings' },
      { name: 'Admin – Conversations', description: 'Conversation monitoring' },
    ],
    paths: {
      // ── Auth ──────────────────────────────────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['username','password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'JWT token + user info', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, role: { type: 'string' }, code: { type: 'string' } } } } } },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register participant',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['username','password','registration_code'], properties: { username: { type: 'string', minLength: 5, maxLength: 8 }, password: { type: 'string', minLength: 5, maxLength: 8 }, registration_code: { type: 'string' } } } } },
          },
          responses: {
            200: { description: 'JWT token', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' } } } } } },
            400: { description: 'Validation error' },
            403: { description: 'Invalid registration code' },
          },
        },
      },
      // ── Chat ──────────────────────────────────────────────────────────────────
      '/chat/conversations': {
        get: {
          tags: ['Chat'],
          summary: 'List own conversations (participant token required — use /admin/conversations to see all)',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of conversations' } },
        },
        post: {
          tags: ['Chat'],
          summary: 'Create conversation',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' } } } } } },
          responses: { 200: { description: 'New conversation' } },
        },
      },
      '/chat/conversations/{id}/messages': {
        get: {
          tags: ['Chat'],
          summary: 'Get messages in a conversation',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'Array of messages' } },
        },
      },
      '/chat/conversations/{id}/send': {
        post: {
          tags: ['Chat'],
          summary: 'Send a message in a conversation (streams response)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' }, mode: { type: 'string', enum: ['secured','direct'] } } } } } },
          responses: { 200: { description: 'SSE stream of response chunks' } },
        },
      },
      '/chat/prompt-library': {
        get: {
          tags: ['Chat'],
          summary: 'List visible prompts for participant (returns [] if CTF state is "stop" — use /admin/prompt-library to see all)',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of prompts' } },
        },
      },
      // ── Challenges (participant) ───────────────────────────────────────────────
      '/challenges/ctf-state': {
        get: {
          tags: ['Challenges'],
          summary: 'Get current CTF state (stop/standby/run)',
          responses: { 200: { description: 'CTF state' } },
        },
        post: {
          tags: ['Admin – Challenges'],
          summary: 'Set CTF state (stop / standby / run)',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['state'], properties: { state: { type: 'string', enum: ['stop','standby','run'] } } } } } },
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      '/challenges/leaderboard': {
        get: {
          tags: ['Challenges'],
          summary: 'Get leaderboard',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Leaderboard rankings' } },
        },
      },
      '/challenges/participant': {
        get: {
          tags: ['Challenges'],
          summary: 'List visible challenges with completion status',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of challenges' } },
        },
      },
      '/challenges/participant/history': {
        get: {
          tags: ['Challenges'],
          summary: 'Get participant challenge history',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of completions' } },
        },
      },
      '/challenges/participant/{id}/hint': {
        post: {
          tags: ['Challenges'],
          summary: 'Request hint for a challenge',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'Hint text' } },
        },
      },
      '/challenges/participant/{id}/check': {
        post: {
          tags: ['Challenges'],
          summary: 'Submit a challenge answer',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { transaction_id: { type: 'string' }, text_answer: { type: 'string' } } } } } },
          responses: { 200: { description: 'Result: correct/incorrect/already_completed' } },
        },
      },
      // ── Admin – Codes ─────────────────────────────────────────────────────────
      '/admin/codes': {
        get: {
          tags: ['Admin – Codes'],
          summary: 'List all participant access codes',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of participant codes' } },
        },
        post: {
          tags: ['Admin – Codes'],
          summary: 'Create participant access code(s)',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'string' }, role: { type: 'string', default: 'participant' }, label: { type: 'string' } } } } } },
          responses: { 200: { description: 'Created code info' } },
        },
      },
      '/admin/codes/{code}': {
        delete: {
          tags: ['Admin – Codes'],
          summary: 'Delete a participant',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'OK' } },
        },
      },
      // ── Admin – Admins ────────────────────────────────────────────────────────
      '/admin/admins': {
        get: {
          tags: ['Admin – Admins'],
          summary: 'List admin accounts',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of admins' } },
        },
      },
      '/admin/admins/{code}/disable': {
        patch: {
          tags: ['Admin – Admins'],
          summary: 'Toggle admin disabled state',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      '/admin/admins/{code}/reset-password': {
        post: {
          tags: ['Admin – Admins'],
          summary: 'Reset admin password (generates new random password)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'New password', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, password: { type: 'string' } } } } } } },
        },
      },
      '/admin/admins/{code}/regenerate-token': {
        post: {
          tags: ['Admin – Admins'],
          summary: 'Regenerate admin API token',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'New token' } },
        },
      },
      // ── Admin – Prompts ───────────────────────────────────────────────────────
      '/admin/prompt-library': {
        get: {
          tags: ['Admin – Prompts'],
          summary: 'List all prompts',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of prompts' } },
        },
        post: {
          tags: ['Admin – Prompts'],
          summary: 'Create one or more prompts',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['prompts'], properties: { prompts: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
        delete: {
          tags: ['Admin – Prompts'],
          summary: 'Delete all prompts',
          security: [{ bearerAuth: [] }],
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      '/admin/prompt-library/{id}': {
        delete: {
          tags: ['Admin – Prompts'],
          summary: 'Delete a prompt',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
        patch: {
          tags: ['Admin – Prompts'],
          summary: 'Update prompt text or visibility',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, visible: { type: 'integer', enum: [0, 1] } } } } } },
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      // ── Admin – AI Providers ──────────────────────────────────────────────────
      '/admin/aiproviders': {
        get: {
          tags: ['Admin – AI Providers'],
          summary: 'List all AI providers',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of AI providers' } },
        },
      },
      '/admin/aiproviders/retrieve': {
        post: {
          tags: ['Admin – AI Providers'],
          summary: 'Sync AI providers and models from Netskope tenant',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Updated providers list' } },
        },
      },
      '/admin/aiproviders/{id}': {
        put: {
          tags: ['Admin – AI Providers'],
          summary: 'Update provider API token, visibility or models',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { api_token: { type: 'string' }, visible: { type: 'integer', enum: [0,1] }, models: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      // ── Admin – Challenges ────────────────────────────────────────────────────
      '/challenges': {
        get: {
          tags: ['Admin – Challenges'],
          summary: 'List all challenges',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of challenges' } },
        },
        post: {
          tags: ['Admin – Challenges'],
          summary: 'Create a challenge',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, description: { type: 'string' }, challenge_type: { type: 'string', enum: ['transaction_id','text'] }, visible: { type: 'integer' }, ns_time_filter: { type: 'integer' }, ch_points: { type: 'integer' }, hint: { type: 'string' } } } } } },
          responses: { 200: { description: 'Created challenge' } },
        },
      },
      '/challenges/all': {
        delete: {
          tags: ['Admin – Challenges'],
          summary: 'Delete all challenges',
          security: [{ bearerAuth: [] }],
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      '/challenges/{id}': {
        put: {
          tags: ['Admin – Challenges'],
          summary: 'Update a challenge',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
        delete: {
          tags: ['Admin – Challenges'],
          summary: 'Delete a challenge',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      // ── Admin – Settings ──────────────────────────────────────────────────────
      '/admin/settings/setup-status': {
        get: {
          tags: ['Admin – Settings'],
          summary: 'Get portal setup status (which settings are configured)',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Setup status object' } },
        },
      },
      '/admin/settings/netskope': {
        get: {
          tags: ['Admin – Settings'],
          summary: 'Get Netskope tenant settings (tenant URL, API token)',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Netskope settings' } },
        },
        put: {
          tags: ['Admin – Settings'],
          summary: 'Update Netskope tenant settings',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { netskope_tenant: { type: 'string' }, netskope_api_token: { type: 'string' } } } } } },
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      '/admin/settings/gateway-url': {
        get: {
          tags: ['Admin – Settings'],
          summary: 'Get AI gateway URL',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Gateway URL' } },
        },
        put: {
          tags: ['Admin – Settings'],
          summary: 'Set AI gateway URL',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { gateway_url: { type: 'string' }, gateway_url_private: { type: 'string', description: 'Empty = same as public' } } } } } },
          responses: { 200: { $ref: '#/components/schemas/Ok' } },
        },
      },
      '/admin/settings/max-prompts': {
        get: { tags: ['Admin – Settings'], summary: 'Get max prompts per conversation', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Max prompts value' } } },
        put: { tags: ['Admin – Settings'], summary: 'Set max prompts per conversation', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { value: { type: 'integer' } } } } } }, responses: { 200: { $ref: '#/components/schemas/Ok' } } },
      },
      '/admin/settings/models': {
        get: { tags: ['Admin – Settings'], summary: 'Get allowed models list', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Models list' } } },
        put: { tags: ['Admin – Settings'], summary: 'Update allowed models list', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { $ref: '#/components/schemas/Ok' } } },
      },
      // ── Admin – Conversations ─────────────────────────────────────────────────
      '/admin/conversations': {
        get: {
          tags: ['Admin – Conversations'],
          summary: 'List all participant conversations (all users)',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Array of conversations' } },
        },
      },
      '/admin/conversations/user/{code}': {
        get: {
          tags: ['Admin – Conversations'],
          summary: 'List conversations for a specific participant',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' }, example: 'DEMO-01' }],
          responses: { 200: { description: 'Array of conversations' } },
        },
      },
      '/admin/conversations/single/{id}/messages': {
        get: {
          tags: ['Admin – Conversations'],
          summary: 'Get messages in a specific conversation',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: 'Array of messages' } },
        },
      },
    },
  },
  apis: [],
};

module.exports = swaggerJsdoc(options);
