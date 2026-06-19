/* ── State ── */
let token = null;
let userInfo = null;
let currentConvId = null;
let isSending = false;
let currentMode = 'llm';
let currentRouteMode = localStorage.getItem('cd_route_mode') || 'secured';
let globalGatewayUrl = '';
let participantPromptLibrary = [];
let _loadingAdminCodes = false;
let _loadingDashboard = false;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved lang
  if (typeof updateLangPicker === 'function') updateLangPicker(currentLang);
  applyTranslations();

  // Load CTF status on login screen
  fetch('/api/challenges/ctf-state').then(r => r.json()).then(data => {
    const el = document.getElementById('login-ctf-status');
    if (!el) return;
    const labels = { stop: 'Stopped', standby: 'Standby', run: 'Running' };
    const colors = { stop: '#ef4444', standby: '#f59e0b', run: '#22c55e' };
    const state = data.state || 'stop';
    el.textContent = labels[state] || state;
    el.style.color = colors[state] || '';
  }).catch(() => {});

  // Load live telemetry on login screen
  fetch('/api/challenges/telemetry').then(r => r.json()).then(d => {
    const now = new Date();
    const ts = now.toTimeString().slice(0,8);
    const el = id => document.getElementById(id);
    if (el('telemetry-ts')) el('telemetry-ts').textContent = ts;

    if (el('telemetry-gw')) el('telemetry-gw').textContent = d.gateway ? 'connected' : 'offline';
    if (el('telemetry-gw-dot')) el('telemetry-gw-dot').className = `telemetry-dot ${d.gateway ? 'telemetry-dot--ok' : 'telemetry-dot--warn'}`;

    if (el('telemetry-participants')) el('telemetry-participants').textContent = `${d.participants} registered`;
    if (el('telemetry-challenges')) el('telemetry-challenges').textContent = `${d.challenges} active`;

    if (el('telemetry-top')) {
      const medals = ['1st', '2nd', '3rd'];
      if (d.ranking && d.ranking.length > 0) {
        el('telemetry-top').innerHTML = d.ranking
          .map(r => `<span class="telemetry-rank-entry"><span class="telemetry-rank-pos">${medals[r.pos - 1]}</span><span class="telemetry-rank-name">${r.name}</span><span class="telemetry-rank-pts">${r.pts} pts</span></span>`)
          .join('');
        if (el('telemetry-top-dot')) el('telemetry-top-dot').style.opacity = '1';
      } else {
        el('telemetry-top').textContent = 'none yet';
        if (el('telemetry-top-dot')) el('telemetry-top-dot').style.opacity = '0';
      }
    }
  }).catch(() => {});

  // Load registration status on login screen
  fetch('/api/challenges/registration-status').then(r => r.json()).then(data => {
    const el = document.getElementById('login-reg-status');
    if (!el) return;
    el.textContent = data.open ? 'Open' : 'Closed';
    el.style.color = data.open ? '#22c55e' : '#ef4444';
  }).catch(() => {});

  // Apply saved theme
  const savedTheme = localStorage.getItem('cd_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateAdminLogo(savedTheme);

  // Check existing session
  token = localStorage.getItem('cd_token');
  if (token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      const payload = JSON.parse(json);
      if (payload.exp * 1000 > Date.now()) {
        userInfo = payload;
        enterApp();
        return;
      }
    } catch {}
    localStorage.removeItem('cd_token');
  }

  // Populate model list
  updateModelList();

  // Enter key on login/register inputs
  document.getElementById('login-password-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-username-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('reg-code-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
});

/* ── Auth ── */

function showLoginPanel() {
  document.getElementById('login-form-panel').style.display = '';
  document.getElementById('register-form-panel').style.display = 'none';
  const adminPanel = document.getElementById('admin-login-panel');
  if (adminPanel) adminPanel.style.display = 'none';
  const setupPanel = document.getElementById('admin-setup-panel');
  if (setupPanel) setupPanel.style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
}

function showRegisterPanel() {
  document.getElementById('login-form-panel').style.display = 'none';
  document.getElementById('register-form-panel').style.display = '';
  const adminPanel = document.getElementById('admin-login-panel');
  if (adminPanel) adminPanel.style.display = 'none';
  const setupPanel = document.getElementById('admin-setup-panel');
  if (setupPanel) setupPanel.style.display = 'none';
  document.getElementById('register-error').style.display = 'none';
}

async function handleLogin() {
  const username = document.getElementById('login-username-input').value.trim();
  const password = document.getElementById('login-password-input').value;
  // Only the username is required to submit: an admin doing first-login setup
  // signs in with an empty password and the backend returns setup_required.
  if (!username) return;

  const btn = document.getElementById('login-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showLoginError(data.error || t('loginError'));
      return;
    }

    // Default admin with no password yet → switch to first-login setup.
    if (data.setup_required) {
      showAdminSetupPanel(data.username || username, password);
      return;
    }

    _setSession(data);
    enterApp(true);
  } catch {
    showLoginError('Connection error. Is the server running?');
  } finally {
    btn.disabled = false;
  }
}

function showAdminSetupPanel(username, prefillPassword) {
  document.getElementById('login-form-panel').style.display = 'none';
  document.getElementById('register-form-panel').style.display = 'none';
  const adminLogin = document.getElementById('admin-login-panel');
  if (adminLogin) adminLogin.style.display = 'none';
  const panel = document.getElementById('admin-setup-panel');
  panel.style.display = '';
  document.getElementById('admin-setup-username').value = username;
  document.getElementById('admin-setup-password').value = prefillPassword || '';
  document.getElementById('admin-setup-confirm').value = '';
  document.getElementById('admin-setup-error').style.display = 'none';
  const focusEl = prefillPassword ? document.getElementById('admin-setup-confirm') : document.getElementById('admin-setup-password');
  focusEl.focus();
}

async function handleAdminSetup() {
  const username = document.getElementById('admin-setup-username').value.trim();
  const password = document.getElementById('admin-setup-password').value;
  const confirm = document.getElementById('admin-setup-confirm').value;
  const err = document.getElementById('admin-setup-error');
  err.style.color = '';

  if (password.length < 8) {
    err.textContent = t('adminSetupTooShort'); err.style.display = 'block'; return;
  }
  if (password !== confirm) {
    err.textContent = t('adminSetupMismatch'); err.style.display = 'block'; return;
  }

  const btn = document.getElementById('admin-setup-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/auth/admin-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || t('loginError'); err.style.display = 'block'; return;
    }
    _setSession(data);
    document.getElementById('admin-setup-panel').style.display = 'none';
    showLoginPanel();
    enterApp(true);
  } catch {
    err.textContent = 'Connection error. Is the server running?'; err.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-username-input').value.trim();
  const password = document.getElementById('reg-password-input').value;
  const registration_code = document.getElementById('reg-code-input').value.trim();
  if (!username || !password || !registration_code) return;
  if (username.length < 5 || username.length > 8) { showRegisterError('Username must be between 5 and 8 characters'); return; }
  if (password.length < 5 || password.length > 8) { showRegisterError('Password must be between 5 and 8 characters'); return; }

  const btn = document.getElementById('register-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, registration_code })
    });
    const data = await res.json();

    if (!res.ok) {
      showRegisterError(data.error || 'Registration failed');
      return;
    }

    // Registration successful — redirect to login
    document.getElementById('reg-username-input').value = '';
    document.getElementById('reg-password-input').value = '';
    document.getElementById('reg-code-input').value = '';
    showLoginPanel();
    const loginErr = document.getElementById('login-error');
    loginErr.textContent = `Account "${username}" created. Sign in to continue.`;
    loginErr.style.display = 'block';
    loginErr.style.color = 'var(--success)';
    document.getElementById('login-username-input').value = username;
  } catch {
    showRegisterError('Connection error. Is the server running?');
  } finally {
    btn.disabled = false;
  }
}


function _setSession(data) {
  token = data.token;
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  userInfo = JSON.parse(json);
  userInfo.token_group_name = data.token_group_name;
  userInfo.token_name = data.token_name;
  userInfo.icon = data.icon || null;
  userInfo.username = data.username || null;
  localStorage.setItem('cd_token', token);
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.style.color = '';
  el.textContent = msg;
  el.style.display = 'block';
}

function showRegisterError(msg) {
  const el = document.getElementById('register-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function handleLogout() {
  localStorage.removeItem('cd_token');
  token = null; userInfo = null; currentConvId = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-username-input').value = '';
  document.getElementById('login-password-input').value = '';
  document.getElementById('login-error').style.display = 'none';
  showLoginPanel();
}

/* ── App Entry ── */
// freshLogin=true → just signed in (always land on Dashboard).
// freshLogin=false → session restore on page refresh (keep last section).
function enterApp(freshLogin = false) {
  document.getElementById('login-screen').style.display = 'none';

  if (userInfo.role === 'admin') {
    document.getElementById('admin-screen').style.display = 'flex';
    updateAdminLogo(document.documentElement.getAttribute('data-theme') || 'light');
    let tab = 'dashboard';
    if (!freshLogin) {
      const savedTab = localStorage.getItem('adminTab');
      const validTabs = ['dashboard','control','codes','apikeys','aigateway','prompts','challenges','conversations','mcp','aiproviders','settings','admins','about'];
      if (savedTab && validTabs.includes(savedTab)) tab = savedTab;
    }
    adminTab(tab);
    checkSetupWizard();
    loadAdminCodes();
    loadAvailableApiKeys();
    applyAdminLang(localStorage.getItem('cd_lang') || 'en');
  } else {
    document.getElementById('app').style.display = 'flex';
    setupUser();
    loadConversations();
  }
}

async function setupUser() {
  const avatarEl = document.getElementById('user-avatar');
  if (userInfo.icon && userInfo.role !== 'admin') {
    avatarEl.textContent = userInfo.icon;
    avatarEl.classList.add('user-avatar--emoji');
  } else {
    avatarEl.textContent = userInfo.code.slice(0, 2).toUpperCase();
    avatarEl.classList.remove('user-avatar--emoji');
  }
  document.getElementById('user-name').textContent = userInfo.code;
  const sessionTitle = document.getElementById('participant-session-title');
  if (sessionTitle) sessionTitle.textContent = `${userInfo.code} · Participant Lab Console`;
  document.getElementById('cfg-token-group-display').textContent = userInfo.token_group_name || 'Not assigned';
  document.getElementById('cfg-token-name-display').textContent = userInfo.token_name || 'Not assigned';
  updateAdminLogo(document.documentElement.getAttribute('data-theme') || 'light');
  await fetchEnabledModels();
  updateModelList();
  loadParticipantConfig();
  applyTranslations();
  await loadGatewayUrl();
  loadTenantUrl();
  await refreshPromptCounter();
  initRouteMode();
  setupPromptDropZone();
  await fetchCtfStateForChat();
  maybeStartParticipantTour();
}

async function fetchCtfStateForChat() {
  try {
    const res = await fetch('/api/challenges/ctf-state');
    const data = await res.json();
    _ctfState = data.state || 'stop';
    updateChatInputState();
  } catch {}
}

async function refreshPromptCounter() {
  if (userInfo?.role === 'admin') return;
  try {
    const res = await apiFetch('/api/chat/prompt-usage');
    const d = await res.json();
    updatePromptCounter(d.used, d.max);
  } catch {}
}

function updatePromptCounter(used, max) {
  const el = document.getElementById('prompt-counter');
  const text = document.getElementById('prompt-counter-text');
  if (!el || !text) return;
  const remaining = max - used;
  el.style.display = 'flex';
  text.textContent = `${remaining} prompts left`;
  const pct = max > 0 ? remaining / max : 0;
  if (pct <= 0.15) {
    el.style.borderColor = 'rgba(248,113,113,0.4)';
    el.style.color = 'var(--danger)';
    text.style.color = 'var(--danger)';
  } else if (pct <= 0.5) {
    el.style.borderColor = 'rgba(251,191,36,0.4)';
    el.style.color = 'var(--warning)';
    text.style.color = 'var(--warning)';
  } else {
    el.style.borderColor = 'var(--border)';
    el.style.color = 'var(--text-muted)';
    text.style.color = 'var(--text-muted)';
  }
}

/* ── Theme ── */
function updateAdminLogo(theme) {
  const src = theme === 'light' ? '/img/netskope-logo-light.png' : '/img/netskope-logo-dark.png';
  ['adm-logo','participant-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = src;
  });
  const loginLogo = document.getElementById('login-logo-img');
  if (loginLogo) loginLogo.src = '/img/netskope-logo-dark.png';
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('cd_theme', next);
  updateAdminLogo(next);
  applyTranslations();
}

/* ── Conversations ── */
async function loadConversations() {
  try {
    const res = await apiFetch('/api/chat/conversations');
    const convs = await res.json();
    renderConversationList(convs);
  } catch {}
}

function renderConversationList(convs) {
  const list = document.getElementById('conversations-list');
  list.innerHTML = '';
  for (const conv of convs) {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === currentConvId ? ' active' : '');
    item.dataset.id = conv.id;
    item.innerHTML = `
      <span class="conv-title">${escapeHtml(conv.title)}</span>
      <button class="conv-delete" onclick="deleteConversation('${conv.id}', event)" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      </button>
    `;
    item.addEventListener('click', () => openConversation(conv.id));
    list.appendChild(item);
  }
}

async function newConversation() {
  try {
    const res = await apiFetch('/api/chat/conversations', { method: 'POST', body: JSON.stringify({}) });
    const conv = await res.json();
    currentConvId = conv.id;
    clearMessages();
    await loadConversations();
  } catch {}
}

async function openConversation(id) {
  currentConvId = id;
  document.querySelectorAll('.conv-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));

  try {
    const res = await apiFetch(`/api/chat/conversations/${id}/messages`);
    const msgs = await res.json();
    clearMessages();
    for (const msg of msgs) appendMessage(msg.role, msg.content);
    scrollToBottom();
  } catch {}
}

async function deleteConversation(id, e) {
  e.stopPropagation();
  await apiFetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
  if (currentConvId === id) { currentConvId = null; clearMessages(); }
  loadConversations();
}

/* ── Messaging ── */
async function sendMessage() {
  const input = document.getElementById('prompt-input');
  const message = input.value.trim();
  if (!message || isSending) return;
  if (currentMode !== 'mcp' && !document.getElementById('cfg-model')?.value) return;

  // Create conversation if needed
  if (!currentConvId) {
    const res = await apiFetch('/api/chat/conversations', { method: 'POST', body: JSON.stringify({}) });
    const conv = await res.json();
    currentConvId = conv.id;
    await loadConversations();
  }

  isSending = true;
  document.getElementById('send-btn').disabled = true;
  input.value = '';
  autoResize(input);

  // Hide empty state
  document.getElementById('empty-state').style.display = 'none';

  appendMessage('user', message);
  const thinkingEl = appendThinking();
  scrollToBottom();

  try {
    const res = await apiFetch(`/api/chat/conversations/${currentConvId}/send`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        model: document.getElementById('cfg-model').value,
        provider_name: document.getElementById('cfg-provider')?.value || '',
        mode: currentMode,
        mcp_server: document.getElementById('cfg-mcp-server').value,
        route_mode: currentRouteMode,
      })
    });

    const data = await res.json();
    thinkingEl.remove();

    if (res.ok) {
      appendMessage('assistant', data.message);
      if (data.prompt_count !== undefined) updatePromptCounter(data.prompt_count, data.max_prompts);
    } else if (res.status === 429 && data.error === 'prompt_limit_exceeded') {
      appendMessage('assistant', `🚫 You have reached your prompt limit (${data.max} prompts). Please contact your instructor to reset your counter.`);
      updatePromptCounter(data.used, data.max);
    } else if (res.status === 403 && data.error === 'ctf_not_running') {
      appendMessage('assistant', `⏸️ Chat is currently ${data.state === 'standby' ? 'in standby' : 'disabled'}. Please wait for the instructor to start the CTF.`);
    } else {
      appendMessage('assistant', `⚠️ Error: ${data.error}`);
    }

    loadConversations();
  } catch (err) {
    thinkingEl.remove();
    appendMessage('assistant', `⚠️ Connection error: ${err.message}`);
  } finally {
    isSending = false;
    document.getElementById('send-btn').disabled = false;
    scrollToBottom();
  }
}

function assistantSenderName() {
  return currentRouteMode === 'direct'
    ? 'Unsecured Chat AI Agent'
    : 'Secured Chat AI Agent';
}

function appendMessage(role, content) {
  const area = document.getElementById('messages-area');
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatarContent = role === 'user'
    ? (userInfo?.icon || userInfo?.code?.slice(0, 2).toUpperCase() || 'U')
    : '🛡️';

  const senderName = role === 'user'
    ? (userInfo?.code || 'You')
    : assistantSenderName();

  row.innerHTML = `
    <div class="message-inner">
      <div class="message-avatar">${avatarContent}</div>
      <div class="message-content">
        <div class="message-sender">${senderName}</div>
        <div class="message-text">${escapeHtml(content)}</div>
      </div>
    </div>
  `;
  area.appendChild(row);
  return row;
}

function appendThinking() {
  const area = document.getElementById('messages-area');
  const senderName = assistantSenderName();
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.innerHTML = `
    <div class="message-inner">
      <div class="message-avatar">🛡️</div>
      <div class="message-content">
        <div class="message-sender">${senderName}</div>
        <div class="thinking"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  area.appendChild(row);
  return row;
}

function clearMessages() {
  const area = document.getElementById('messages-area');
  area.innerHTML = emptyStateMarkup();
  applyTranslations();
}

function emptyStateMarkup() {
  return `
    <div class="empty-state" id="empty-state">
      <div class="empty-kicker" id="empty-kicker">${t('emptyKicker')}</div>
      <h1 class="empty-greeting" id="empty-title">${t('emptyTitle')}</h1>
      <p class="empty-sub" id="empty-subtitle">${t('emptySubtitle')}</p>
      <div class="empty-lab-grid">
        <button class="empty-lab-card" onclick="openPromptLibrary()">
          <span class="empty-lab-card-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>
          </span>
          <span>
            <strong id="empty-prompt-title">${t('emptyPromptTitle')}</strong>
            <small id="empty-prompt-body">${t('emptyPromptBody')}</small>
          </span>
        </button>
        <button class="empty-lab-card" onclick="openChallengesPanel()">
          <span class="empty-lab-card-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </span>
          <span>
            <strong id="empty-ctf-title">${t('emptyCtfTitle')}</strong>
            <small id="empty-ctf-body">${t('emptyCtfBody')}</small>
          </span>
        </button>
        <button class="empty-lab-card" onclick="openPanel('instructions')">
          <span class="empty-lab-card-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
          </span>
          <span>
            <strong id="empty-guide-title">${t('emptyGuideTitle')}</strong>
            <small id="empty-guide-body">${t('emptyGuideBody')}</small>
          </span>
        </button>
      </div>
    </div>
  `;
}

function scrollToBottom() {
  const area = document.getElementById('messages-area');
  area.scrollTop = area.scrollHeight;
}

/* ── Input ── */
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  const minHeight = 26;
  const maxHeight = 200;
  el.style.height = '0px';
  const nextHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

/* ── Participant Prompt Library ── */
async function openPromptLibrary() {
  const panel = document.getElementById('prompt-library-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  panel.classList.add('open');
  await loadParticipantPromptLibrary();
}

function closePromptLibrary() {
  document.getElementById('prompt-library-panel')?.classList.remove('open');
}

async function loadParticipantPromptLibrary() {
  const list = document.getElementById('participant-prompt-library-list');
  if (!list) return;
  list.innerHTML = `<div class="prompt-library-empty">${t('promptLibraryLoading')}</div>`;

  try {
    const res = await apiFetch('/api/chat/prompt-library');
    participantPromptLibrary = await res.json();
    renderParticipantPromptLibrary();
  } catch {
    list.innerHTML = `<div class="prompt-library-empty">${t('promptLibraryLoadError')}</div>`;
  }
}

function renderParticipantPromptLibrary() {
  const list = document.getElementById('participant-prompt-library-list');
  if (!list) return;

  if (!participantPromptLibrary.length) {
    list.innerHTML = `<div class="prompt-library-empty">${t('promptLibraryEmpty')}</div>`;
    return;
  }

  list.innerHTML = participantPromptLibrary.map(prompt => `
    <div class="prompt-library-item" draggable="true"
      ondragstart="handlePromptDragStart(event, ${prompt.id})"
      onclick="insertPromptFromLibrary(${prompt.id})">
      <svg class="prompt-library-drag-handle" width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/></svg>
      <div class="prompt-library-item-text">${escapeHtml(prompt.text)}</div>
    </div>
  `).join('');
}

function handlePromptDragStart(event, id) {
  const prompt = participantPromptLibrary.find(p => p.id === id);
  if (!prompt) return;
  event.dataTransfer.setData('text/plain', prompt.text);
  event.dataTransfer.effectAllowed = 'copy';
}

function insertPromptFromLibrary(id) {
  const prompt = participantPromptLibrary.find(p => p.id === id);
  if (!prompt) return;
  const input = document.getElementById('prompt-input');
  if (input) {
    input.value = prompt.text;
    input.focus();
    autoResize(input);
  }
}

function setupPromptDropZone() {
  const input = document.getElementById('prompt-input');
  const wrapper = input?.closest('.input-wrapper');
  const dropArea = document.querySelector('.chat-column');
  if (!input || !wrapper || !dropArea || wrapper.dataset.dropReady === '1') return;
  wrapper.dataset.dropReady = '1';

  const allowDrop = (event, targetEl = wrapper) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    targetEl.classList.add('drag-over');
  };

  const clearDropState = () => {
    wrapper.classList.remove('drag-over');
    dropArea.classList.remove('drag-over');
  };

  dropArea.addEventListener('dragover', event => allowDrop(event, dropArea));
  wrapper.addEventListener('dragover', event => allowDrop(event, wrapper));
  input.addEventListener('dragover', event => allowDrop(event, wrapper));
  wrapper.addEventListener('dragleave', event => {
    if (!wrapper.contains(event.relatedTarget)) wrapper.classList.remove('drag-over');
  });
  dropArea.addEventListener('dragleave', event => {
    if (!dropArea.contains(event.relatedTarget)) clearDropState();
  });
  dropArea.addEventListener('drop', event => {
    event.preventDefault();
    clearDropState();
    const text = event.dataTransfer.getData('text/plain');
    if (text) insertPromptIntoInput(text, { append: true });
  });
  wrapper.addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    clearDropState();
    const text = event.dataTransfer.getData('text/plain');
    if (text) insertPromptIntoInput(text);
  });
}

function insertPromptIntoInput(text, options = {}) {
  const input = document.getElementById('prompt-input');
  if (!input) return;
  const start = options.append ? input.value.length : (input.selectionStart ?? input.value.length);
  const end = options.append ? input.value.length : (input.selectionEnd ?? input.value.length);
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const separatorBefore = before && !before.endsWith('\n') ? '\n' : '';
  const separatorAfter = after && !text.endsWith('\n') ? '\n' : '';
  const insertText = `${separatorBefore}${text}${separatorAfter}`;

  input.value = before + insertText + after;
  const cursor = before.length + insertText.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  autoResize(input);
}

/* ── Participant Tour ── */
let participantTourIndex = 0;
let participantTourResizeHandler = null;

const participantTourStepTargets = [
  { selector: '#messages-area', copy: 'workspace' },
  { selector: '#route-toggle', copy: 'routing' },
  { selector: '#prompt-counter', copy: 'quota' },
  { selector: '#participant-timer-chip', copy: 'timer' },
  { selector: '.input-wrapper', copy: 'chat' },
  { selector: '#sidebar-lab-guide-btn', copy: 'guidelines', mobileNav: true },
  { selector: '#sidebar-prompt-library-btn', copy: 'prompts', mobileNav: true },
  { selector: '#sidebar-challenges-btn', copy: 'challenges', mobileNav: true },
  { selector: '#sidebar-leaderboard-btn', copy: 'leaderboard', mobileNav: true },
  { selector: '#sidebar-config-btn', copy: 'settings', mobileNav: true }
];

function participantTourKey() {
  return `cd_participant_tour_seen_${userInfo?.code || userInfo?.username || 'anonymous'}`;
}

function maybeStartParticipantTour() {
  if (userInfo?.role === 'admin') return;
  if (localStorage.getItem(participantTourKey()) === '1') return;
  setTimeout(() => startParticipantTour(false), 400);
}

function startParticipantTour(manual = false) {
  if (userInfo?.role === 'admin') return;
  if (!manual && localStorage.getItem(participantTourKey()) === '1') return;
  const overlay = document.getElementById('participant-tour');
  if (!overlay) return;

  document.querySelector('#app .sidebar')?.classList.remove('collapsed');
  closePromptLibrary();
  closeChallengesPanel();
  closeLeaderboardPanel();
  closePanel();

  participantTourIndex = 0;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', handleParticipantTourKeydown);
  participantTourResizeHandler = () => renderParticipantTourStep();
  window.addEventListener('resize', participantTourResizeHandler);
  window.addEventListener('scroll', participantTourResizeHandler, true);
  renderParticipantTourStep();
}

function getVisibleParticipantTourSteps() {
  const copy = t('participantTourSteps');
  return participantTourStepTargets.map(step => ({ ...step, ...(copy?.[step.copy] || {}) })).filter(step => {
    const target = document.querySelector(step.selector);
    if (!target) return false;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    return Boolean(step.title && step.body) && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
}

function renderParticipantTourStep() {
  const overlay = document.getElementById('participant-tour');
  if (!overlay?.classList.contains('open')) return;

  const steps = getVisibleParticipantTourSteps();
  if (!steps.length) {
    finishParticipantTour();
    return;
  }
  participantTourIndex = Math.min(participantTourIndex, steps.length - 1);
  const step = steps[participantTourIndex];
  syncParticipantTourContext(step);
  const target = document.querySelector(step.selector);

  document.getElementById('participant-tour-step').textContent = t('participantTourStepLabel', participantTourIndex + 1, steps.length);
  document.getElementById('participant-tour-title').textContent = step.title;
  document.getElementById('participant-tour-body').textContent = step.body;
  document.getElementById('participant-tour-prev').disabled = participantTourIndex === 0;
  document.getElementById('participant-tour-prev').textContent = t('participantTourBack');
  document.querySelector('.participant-tour-skip').textContent = t('participantTourSkip');
  document.getElementById('participant-tour-next').textContent = participantTourIndex === steps.length - 1 ? t('participantTourFinish') : t('participantTourNext');
  document.getElementById('participant-tour-progress').innerHTML = steps
    .map((_, idx) => `<span class="${idx === participantTourIndex ? 'active' : ''}"></span>`)
    .join('');

  positionParticipantTour(target);
}

function syncParticipantTourContext(step) {
  if (window.innerWidth > 640) return;
  document.getElementById('app')?.classList.toggle('nav-open', Boolean(step.mobileNav));
}

function positionParticipantTour(target) {
  const spotlight = document.getElementById('participant-tour-spotlight');
  const card = document.getElementById('participant-tour-card');
  if (!spotlight || !card || !target) return;

  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    spotlight.style.left = `${Math.max(8, rect.left - pad)}px`;
    spotlight.style.top = `${Math.max(8, rect.top - pad)}px`;
    spotlight.style.width = `${Math.min(window.innerWidth - 16, rect.width + pad * 2)}px`;
    spotlight.style.height = `${Math.min(window.innerHeight - 16, rect.height + pad * 2)}px`;

    const cardWidth = Math.min(360, window.innerWidth - 32);
    const measuredHeight = card.offsetHeight || 260;
    let left = rect.right + 16;
    let top = rect.top;

    if (left + cardWidth > window.innerWidth - 16) left = rect.left - cardWidth - 16;
    if (left < 16) left = Math.min(16, Math.max(16, window.innerWidth - cardWidth - 16));
    if (window.innerWidth <= 760) {
      left = 16;
      top = Math.min(window.innerHeight - measuredHeight - 16, rect.bottom + 14);
      if (top < 16) top = 16;
    } else if (top + measuredHeight > window.innerHeight - 16) {
      top = window.innerHeight - measuredHeight - 16;
    }

    card.style.left = `${left}px`;
    card.style.top = `${Math.max(16, top)}px`;
    card.style.width = `${cardWidth}px`;
  });
}

function nextParticipantTourStep() {
  const steps = getVisibleParticipantTourSteps();
  if (participantTourIndex >= steps.length - 1) {
    finishParticipantTour();
    return;
  }
  participantTourIndex++;
  renderParticipantTourStep();
}

function previousParticipantTourStep() {
  if (participantTourIndex === 0) return;
  participantTourIndex--;
  renderParticipantTourStep();
}

function skipParticipantTour() {
  finishParticipantTour();
}

function finishParticipantTour() {
  localStorage.setItem(participantTourKey(), '1');
  closeParticipantTour();
}

function closeParticipantTour() {
  const overlay = document.getElementById('participant-tour');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  closeMobileNav();
  document.removeEventListener('keydown', handleParticipantTourKeydown);
  if (participantTourResizeHandler) {
    window.removeEventListener('resize', participantTourResizeHandler);
    window.removeEventListener('scroll', participantTourResizeHandler, true);
    participantTourResizeHandler = null;
  }
}

function handleParticipantTourKeydown(event) {
  if (event.key === 'Escape') skipParticipantTour();
  if (event.key === 'ArrowRight') nextParticipantTourStep();
  if (event.key === 'ArrowLeft') previousParticipantTourStep();
}

/* ── Config Panel ── */
function openPanel(type) {
  const panelId = type === 'config' ? 'config-panel' : 'instructions-panel';
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  // Close all other student panels first
  ['prompt-library-panel','challenges-panel','leaderboard-panel','config-panel','instructions-panel'].forEach(id => {
    document.getElementById(id)?.classList.remove('open');
  });
  panel.classList.add('open');
  if (type === 'instructions') renderLabInstructions();
}

function closePanel() {
  document.getElementById('config-panel')?.classList.remove('open');
  document.getElementById('instructions-panel')?.classList.remove('open');
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById('mode-llm').classList.toggle('active', mode === 'llm');
  document.getElementById('mode-mcp').classList.toggle('active', mode === 'mcp');
  document.getElementById('llm-config').style.display = mode === 'llm' ? 'flex' : 'none';
  document.getElementById('mcp-config').style.display = mode === 'mcp' ? 'flex' : 'none';
  updateHeaderModelLabel();
  renderConfigSummary();
}

// Refresh the Settings panel's live session summary from current state.
function renderConfigSummary() {
  const routeEl = document.getElementById('cfg-sum-route');
  if (routeEl) {
    const secured = currentRouteMode === 'secured';
    routeEl.textContent = secured ? 'Secured' : 'Direct';
    routeEl.className = 'config-summary-val ' + (secured ? 'is-secured' : 'is-direct');
  }
  const modeEl = document.getElementById('cfg-sum-mode');
  if (modeEl) modeEl.textContent = currentMode === 'mcp' ? 'MCP' : 'LLM';

  const targetLabel = document.getElementById('cfg-sum-target-label');
  const targetVal = document.getElementById('cfg-sum-target');
  if (targetLabel && targetVal) {
    if (currentMode === 'mcp') {
      targetLabel.textContent = 'MCP Server';
      const sel = document.getElementById('cfg-mcp-server');
      const opt = sel && sel.options[sel.selectedIndex];
      targetVal.textContent = (opt && opt.dataset.name) || (sel && sel.value) || 'None';
    } else {
      targetLabel.textContent = 'Model';
      const modelSel = document.getElementById('cfg-model');
      const opt = modelSel && modelSel.options[modelSel.selectedIndex];
      targetVal.textContent = (opt && opt.textContent) || 'None';
    }
  }
  const tokenEl = document.getElementById('cfg-sum-token');
  if (tokenEl) {
    const assigned = !!userInfo?.token_group_name;
    tokenEl.textContent = assigned ? 'Assigned' : 'Not assigned';
    tokenEl.className = 'config-summary-val ' + (assigned ? 'is-ok' : 'is-muted');
  }
}

function setRouteMode(mode) {
  currentRouteMode = mode;

  const secBtn = document.getElementById('route-secured');
  const dirBtn = document.getElementById('route-direct');
  if (!secBtn) return;

  secBtn.classList.toggle('active', mode === 'secured');
  dirBtn.classList.toggle('active', mode === 'direct');
  const main = document.querySelector('#app .main-area');
  if (main) {
    main.classList.toggle('route-secured', mode === 'secured');
    main.classList.toggle('route-direct', mode === 'direct');
  }
  updateHeaderModelLabel();
  renderConfigSummary();
  const footerEl = document.getElementById('input-footer');
  if (footerEl) {
    const key = mode === 'direct' ? 'inputFooterDirect' : 'inputFooter';
    footerEl.textContent = t(key);
  }
  if (userInfo?.code) saveParticipantConfig();
}

function initRouteMode() {
  const toggle = document.getElementById('route-toggle');
  if (toggle) toggle.style.display = 'flex';
  setRouteMode(currentRouteMode);
}

function participantConfigKey() {
  return `cd_participant_config_${userInfo?.code || 'anonymous'}`;
}

async function loadParticipantConfig() {
  if (!userInfo?.code) return;
  try {
    const saved = JSON.parse(localStorage.getItem(participantConfigKey()) || '{}');
    if (saved.mode) currentMode = saved.mode;
    if (saved.route_mode) currentRouteMode = saved.route_mode;
    const providerEl = document.getElementById('cfg-provider');
    if (providerEl && saved.provider && [...providerEl.options].some(o => o.value === saved.provider)) providerEl.value = saved.provider;
    updateModelList();
    const modelEl = document.getElementById('cfg-model');
    if (modelEl && saved.model && [...modelEl.options].some(o => o.value === saved.model)) modelEl.value = saved.model;
    updateHeaderModelLabel();
    setMode(currentMode);
  } catch {}
  await loadMcpServerOptions();
  renderConfigSummary();
  applyParticipantLeaderboardVisibility();
}

// Show/hide the participant leaderboard entry based on the instructor's setting.
async function applyParticipantLeaderboardVisibility() {
  const btn = document.getElementById('sidebar-leaderboard-btn');
  if (!btn) return;
  try {
    const res = await fetch('/api/challenges/leaderboard-visible');
    const data = await res.json();
    const visible = data.visible !== false;
    btn.style.display = visible ? '' : 'none';
    if (!visible) closeLeaderboardPanel();
  } catch {}
}

async function loadMcpServerOptions() {
  const mcpEl = document.getElementById('cfg-mcp-server');
  const urlDisplay = document.getElementById('cfg-mcp-url-display');
  if (!mcpEl) return;
  try {
    const res = await fetch('/api/admin/mcp-servers/public');
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) console.warn('[MCP] public endpoint issue:', data);
    const servers = Array.isArray(data) ? data : [];
    const saved = JSON.parse(localStorage.getItem(participantConfigKey()) || '{}');
    mcpEl.innerHTML = servers.length
      ? servers.map(s => `<option value="${escapeHtml(s.url)}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('')
      : '<option value="">— No MCP servers configured —</option>';
    if (saved.mcp_server && [...mcpEl.options].some(o => o.value === saved.mcp_server)) {
      mcpEl.value = saved.mcp_server;
    }
    if (urlDisplay) urlDisplay.textContent = mcpEl.value || '';
    mcpEl.addEventListener('change', () => { if (urlDisplay) urlDisplay.textContent = mcpEl.value; renderConfigSummary(); });
  } catch (e) { console.error('[MCP] loadMcpServerOptions error:', e); }
}

function saveParticipantConfig() {
  if (!userInfo?.code) return;
  const provider = document.getElementById('cfg-provider')?.value || '';
  const model = document.getElementById('cfg-model')?.value || '';
  const config = {
    mode: currentMode,
    route_mode: currentRouteMode,
    provider,
    model,
    mcp_server: document.getElementById('cfg-mcp-server')?.value || '',
  };
  localStorage.setItem(participantConfigKey(), JSON.stringify(config));
  localStorage.setItem('cd_route_mode', currentRouteMode);
  apiFetch('/api/chat/participant/config', { method: 'POST', body: JSON.stringify({ model, provider }) });
  const msg = document.getElementById('participant-config-save-msg');
  if (msg) {
    msg.style.display = 'inline';
    setTimeout(() => msg.style.display = 'none', 2500);
  }
}

let _enabledModels = null;
let _visibleProviders = []; // raw list from server: [{name, schema}]

async function fetchEnabledModels() {
  try {
    const res = await fetch('/api/admin/settings/models/public');
    const d = await res.json();
    _enabledModels = d.enabled_models;
    _visibleProviders = d.visible_providers || [];
  } catch {
    _enabledModels = null;
    _visibleProviders = [];
  }
}

function updateProviderOptions() {
  const select = document.getElementById('cfg-provider');
  if (!select) return;
  const current = select.value;

  select.innerHTML = _visibleProviders.length
    ? _visibleProviders.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('')
    : '<option value="" disabled>No AI providers available</option>';

  if ([..._visibleProviders].some(p => p.name === current)) {
    select.value = current;
  } else if (_visibleProviders.length) {
    select.value = _visibleProviders[0].name;
  }
}

function updateModelList() {
  const provider = document.getElementById('cfg-provider')?.value || '';
  const select = document.getElementById('cfg-model');
  if (!select) return;
  updateProviderOptions();
  const providerName = document.getElementById('cfg-provider')?.value || '';
  const providerObj = _visibleProviders.find(p => p.name === providerName);
  const nameLower = (providerName || '').toLowerCase();
  const NAME_SCHEMA_MAP = [
    ['mistral','mistral'],['anthropic','anthropic'],['claude','claude'],
    ['gemini','gemini'],['google','google'],['bedrock','bedrock'],
    ['deepseek','deepseek'],['xai','xai'],['grok','xai'],
    ['perplexity','perplexity'],['cohere','cohere'],['openai','openai'],
  ];
  let modelKey = 'openai';
  for (const [kw, k] of NAME_SCHEMA_MAP) { if (nameLower.includes(kw)) { modelKey = k; break; } }
  const nameModelList = MODELS[modelKey] || [];
  // Use provider-specific models from DB if available, else fall back to MODELS lookup by name
  let all;
  if (providerObj?.models) {
    const dbModels = JSON.parse(providerObj.models);
    all = dbModels.map(m => {
      const found = nameModelList.find(sm => sm.value === m);
      return found || { value: m, label: m };
    });
  } else {
    all = nameModelList;
  }
  const models = all;
  select.innerHTML = models.length
    ? models.map(m => `<option value="${m.value}">${m.label}</option>`).join('')
    : `<option value="" disabled>No models available</option>`;
  updateHeaderModelLabel();
  renderConfigSummary();
}

/* ── Gateway URL ── */
async function loadAdminGatewayUrl() {
  try {
    const res = await apiFetch('/api/admin/settings/gateway-url');
    const data = await res.json();
    const input = document.getElementById('admin-gateway-url');
    if (input) input.value = data.gateway_url || '';
  } catch {}
}

async function loadTemplateUrls() {
  try {
    const res = await apiFetch('/api/admin/settings/template-urls');
    const data = await res.json();
    const p = document.getElementById('template-url-prompts');
    const c = document.getElementById('template-url-challenges');
    if (p) p.value = data.prompt_library || '';
    if (c) c.value = data.challenges || '';
  } catch {}
}

async function saveTemplateUrls() {
  const prompt_library = document.getElementById('template-url-prompts').value.trim();
  const challenges = document.getElementById('template-url-challenges').value.trim();
  const res = await apiFetch('/api/admin/settings/template-urls', {
    method: 'PUT',
    body: JSON.stringify({ prompt_library, challenges })
  });
  const msg = document.getElementById('template-urls-save-msg');
  if (res.ok) {
    msg.textContent = 'Saved!';
    msg.style.color = 'var(--success)';
  } else {
    msg.textContent = 'Error saving';
    msg.style.color = 'var(--danger)';
  }
  msg.style.display = 'inline';
  setTimeout(() => msg.style.display = 'none', 2500);
}

async function testTemplateUrls() {
  const msg = document.getElementById('template-urls-test-msg');
  msg.textContent = 'Testing…';
  msg.style.color = 'var(--text-secondary)';
  msg.style.display = 'inline';
  try {
    const res = await apiFetch('/api/admin/settings/test-template-urls');
    const data = await res.json();
    const pl = data.prompt_library;
    const ch = data.challenges;
    const failed = [pl, ch].filter(r => !r.ok).length;
    const ok = failed === 0;
    msg.textContent = ok ? 'Both URLs reachable' : `Failed: ${failed} · Success: ${2 - failed}`;
    msg.style.color = ok ? 'var(--success)' : 'var(--danger)';
  } catch {
    msg.textContent = 'Test failed';
    msg.style.color = 'var(--danger)';
  }
  setTimeout(() => msg.style.display = 'none', 4000);
}

async function resetTemplateUrls() {
  const res = await apiFetch('/api/admin/settings/template-urls', {
    method: 'PUT',
    body: JSON.stringify({ prompt_library: '', challenges: '' })
  });
  if (res.ok) loadTemplateUrls();
}

function updateHeaderModelLabel() {
  const el = document.getElementById('header-model-label');
  const el2 = document.getElementById('input-model-label');
  const model = document.getElementById('cfg-model')?.value || '';
  const routeLabel = currentRouteMode === 'direct' ? 'Direct' : 'Secured';
  if (el) el.textContent = `${t('headerModelLabel', model, currentMode)} · ${routeLabel}`;
  if (el2) el2.textContent = model;
}

function toggleModelDropdown() {
  const menu = document.getElementById('model-dropdown-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) { menu.style.display = 'none'; return; }

  const providerName = document.getElementById('cfg-provider')?.value || '';
  const providerSchema = (_visibleProviders.find(p => p.name === providerName)?.schema || providerName).toLowerCase();
  const currentModel = document.getElementById('cfg-model')?.value || '';
  const all = MODELS[providerSchema] || [];
  const filtered = _enabledModels === null ? all : all.filter(m => _enabledModels.includes(m.value));
  const enabled = filtered.length ? filtered : all;

  let html = '';
  if (enabled.length) {
    html += `<div class="model-dropdown-section">${escapeHtml(providerName)}</div>`;
    html += enabled.map(m => `
      <button class="model-dropdown-item${m.value === currentModel ? ' active' : ''}" onclick="selectModel('${m.value}')">
        ${m.value === currentModel ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '<span style="width:12px;display:inline-block;"></span>'}
        ${m.label}
      </button>`).join('');
  }

  menu.innerHTML = html;
  menu.style.display = 'flex';

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!document.getElementById('model-dropdown-wrap')?.contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

function selectModel(value) {
  const select = document.getElementById('cfg-model');
  if (select) { select.value = value; saveParticipantConfig(); }
  updateHeaderModelLabel();
  document.getElementById('model-dropdown-menu').style.display = 'none';
}

// ── Mobile off-canvas nav (participant) ──
function toggleMobileNav() {
  // Always show the full (non-collapsed) sidebar inside the mobile drawer
  document.querySelector('#app .sidebar')?.classList.remove('collapsed');
  document.getElementById('app')?.classList.toggle('nav-open');
}
function closeMobileNav() {
  document.getElementById('app')?.classList.remove('nav-open');
}
// ── Mobile off-canvas nav (admin) ──
function toggleAdminNav() {
  document.getElementById('admin-screen')?.classList.toggle('nav-open');
}
function closeAdminNav() {
  document.getElementById('admin-screen')?.classList.remove('nav-open');
}
document.addEventListener('DOMContentLoaded', () => {
  // Close the drawer after tapping any sidebar action
  document.querySelector('#app .sidebar')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeMobileNav();
  });
  // Admin: close drawer after tapping a nav item
  document.querySelector('#admin-screen .adm-nav')?.addEventListener('click', (e) => {
    if (e.target.closest('.adm-nav-item')) closeAdminNav();
  });
  // Reset drawer state when leaving mobile width
  window.addEventListener('resize', () => {
    if (window.innerWidth > 640) { closeMobileNav(); closeAdminNav(); }
  });
});

function toggleSidebar() {
  const sidebar = document.querySelector('#app .sidebar');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  if (expandBtn) expandBtn.style.display = 'none';
  const collapseBtn = sidebar.querySelector('.sidebar-collapse-btn');
  if (collapseBtn) collapseBtn.title = sidebar.classList.contains('collapsed') ? 'Expand sidebar' : 'Collapse sidebar';
}

async function loadGatewayUrl() {
  try {
    const res = await fetch('/api/settings/gateway-url');
    const data = await res.json();
    globalGatewayUrl = data.gateway_url || '';
  } catch {}
}

async function loadTenantUrl() {
  try {
    const res = await fetch('/api/settings/tenant');
    const data = await res.json();
    const display = document.getElementById('cfg-tenant-url-display');
    if (display) display.textContent = data.tenant ? `https://${data.tenant}` : '—';
  } catch {}
}

async function saveGatewayUrl() {
  const url = document.getElementById('admin-gateway-url').value.trim();
  if (!url) return;
  const res = await apiFetch('/api/admin/settings/gateway-url', {
    method: 'PUT',
    body: JSON.stringify({ gateway_url: url })
  });
  if (res.ok) {
    globalGatewayUrl = url;
    const msg = document.getElementById('gateway-save-msg');
    msg.style.display = 'inline';
    setTimeout(() => msg.style.display = 'none', 2500);
  }
}

/* ── Admin ── */
let selectedUserCode = null;

function adminTab(tab) {
  document.querySelectorAll('.adm-nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');
  localStorage.setItem('adminTab', tab);
  if (tab === 'dashboard') { loadDashboard(); }
  if (tab === 'aigateway') { loadNetskopeSettings(); loadAdminGatewayUrl(); loadAiGatewayMonitor(); }
  if (tab === 'settings') { loadModelSettings(); loadProviderTokens(); loadTemplateUrls(); }
  if (tab === 'mcp') loadMcpServers();
  if (tab === 'apikeys') loadApiKeys();
  if (tab === 'prompts') { loadPromptLibrary(); }
  if (tab === 'codes') { loadAdminCodes(); loadAvailableApiKeys(); }
  if (tab === 'conversations') { showUserList(); loadAdminConversations(); }
  if (tab === 'admins') loadAdmins();
  if (tab === 'aiproviders') loadAiProviders();
  if (tab === 'challenges') loadChallenges();
  if (tab === 'control') { loadControlCenter(); loadMaxPromptsSetting(); loadMaxRetriesSetting(); }
  if (tab === 'about') loadAboutVersion();
}

// Control Center — the live CTF/registration/leaderboard controls + reg code.
function loadControlCenter() {
  loadCTFState();
  loadRegOpen();
  loadRegCode();
  loadLeaderboardVisible();
}

const AI_PROVIDER_ICONS = {};
let _aiProviders = [];

function getDefaultModels(p) {
  const nameLower = (p.name || '').toLowerCase();
  const NAME_KEYWORDS = [
    ['mistral',    'mistral'],
    ['anthropic',  'anthropic'],
    ['claude',     'anthropic'],
    ['gemini',     'gemini'],
    ['google',     'google'],
    ['bedrock',    'bedrock'],
    ['deepseek',   'deepseek'],
    ['xai',        'xai'],
    ['grok',       'xai'],
    ['perplexity', 'perplexity'],
    ['cohere',     'cohere'],
    ['openai',     'openai'],
  ];
  for (const [kw, key] of NAME_KEYWORDS) {
    if (nameLower.includes(kw)) return SCHEMA_MODELS[key] || [];
  }
  return SCHEMA_MODELS[p.schema] || [];
}

const SCHEMA_MODELS = {
  openai:     ['GPT-4o mini', 'GPT-4.1 mini', 'o4 mini'],
  anthropic:  ['Claude 3.5 Haiku', 'Claude Haiku 4.5', 'Claude Sonnet 4.6'],
  gemini:     ['Gemini 2.0 Flash', 'Gemini 2.5 Flash', 'Gemini 2.5 Flash Lite'],
  google:     ['Gemini 2.0 Flash', 'Gemini 2.5 Flash', 'Gemini 2.5 Flash Lite'],
  bedrock:    ['Nova Lite', 'Nova Micro', 'Llama 3.3 70B'],
  mistral:    ['Mistral Small', 'Mistral Small 25.03', 'Mistral Nemo'],
  deepseek:   ['DeepSeek V3', 'DeepSeek R1', 'DeepSeek V3 0324'],
  xai:        ['Grok 3 Mini', 'Grok 3 Mini Fast', 'Grok 2'],
  perplexity: ['Sonar', 'Sonar Pro', 'Sonar Reasoning'],
  cohere:     ['Command R', 'Command R+', 'Command A'],
};

function renderAiProvidersTable(providers) {
  const state = document.getElementById('aiproviders-state');
  const table = document.getElementById('aiproviders-table');
  const tbody = document.getElementById('aiproviders-body');
  _aiProviders = Array.isArray(providers) ? providers : [];
  updateAiProvidersToggleAllButton();

  if (!providers.length) {
    state.textContent = 'No providers yet. Click "Retrieve AI Providers from Netskope Tenant" to sync.';
    state.style.display = 'block';
    table.style.display = 'none';
    return;
  }

  tbody.innerHTML = providers.map(p => {
    const iconKey = Object.keys(AI_PROVIDER_ICONS).find(k => p.name.startsWith(k)) || 'default';
    const icon = AI_PROVIDER_ICONS[iconKey];
    const schemaBadge = `<span class="provider-badge provider-badge--${p.schema}">${p.schema}</span>`;
    const hasToken = !!p.api_token;
    const defaultModels = getDefaultModels(p);
    const models = p.models ? JSON.parse(p.models) : defaultModels;
    const modelBadges = models.map(m => `<span class="aip-model-badge">${escapeHtml(m)}</span>`).join('');
    const tokenCell = `
      <div class="aip-token-cell">
        ${hasToken
          ? `<span class="aip-token-status">
               <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
               Configured
             </span>`
          : `<span class="aip-token-missing">Not set</span>`
        }
        <button class="row-icon-btn row-icon-btn--info" onclick="openAipTokenModal(${p.id}, '${escapeHtml(p.name)}', ${hasToken})" title="${hasToken ? 'Edit token' : 'Add token'}" aria-label="${hasToken ? 'Edit token' : 'Add token'}">
          ${rowActionIcon('edit')}
        </button>
      </div>`;
    const isVisible = promptIsVisible(p.visible);
    const visibleButton = `
      <button class="row-icon-btn ${isVisible ? 'row-icon-btn--policy' : ''}" onclick="toggleAiProviderVisible(${p.id}, ${isVisible ? 0 : 1}, this)" title="${isVisible ? 'Visible to participants' : 'Hidden from participants'}" aria-label="${isVisible ? 'Visible to participants' : 'Hidden from participants'}">
        ${rowActionIcon(isVisible ? 'visible' : 'hidden')}
      </button>`;
    return `<tr>
      <td class="resource-id-cell" style="text-align:center;"><code>#${p.id}</code></td>
      <td><strong>${p.name}</strong></td>
      <td style="font-family:monospace;font-size:12px;color:var(--text-secondary);">${p.host}:${p.port}</td>
      <td>${schemaBadge}</td>
      <td class="resource-main-end">${modelBadges || '<span style="font-size:11px;color:var(--text-muted);">—</span>'}</td>
      <td style="text-align:center;">
        <button class="row-icon-btn row-icon-btn--policy" data-aip-id="${p.id}" data-aip-name="${escapeHtml(p.name)}" data-aip-models="${escapeHtml(JSON.stringify(models))}" onclick="openAipModelsModal(+this.dataset.aipId, this.dataset.aipName, this.dataset.aipModels)" title="Edit models">${rowActionIcon('edit')}</button>
      </td>
      <td style="text-align:center;">${tokenCell}</td>
      <td style="text-align:center;">${visibleButton}</td>
      <td style="text-align:center;">${p.ns_id && p.ns_id.startsWith('manual-') ? `<button class="row-icon-btn row-icon-btn--danger" onclick="deleteManualAipProvider(${p.id})" title="Delete provider">${rowActionIcon('delete')}</button>` : ''}</td>
    </tr>`;
  }).join('');

  state.style.display = 'none';
  table.style.display = '';
}

async function loadAiProviders() {
  const state = document.getElementById('aiproviders-state');
  state.style.display = 'block';
  state.textContent = 'Loading…';
  document.getElementById('aiproviders-table').style.display = 'none';
  try {
    const res = await apiFetch('/api/admin/aiproviders');
    if (!res.ok) { state.textContent = `Error ${res.status}`; return; }
    renderAiProvidersTable(await res.json());
  } catch (e) {
    state.textContent = 'Failed to load: ' + e.message;
  }
}

async function retrieveAiProviders() {
  showConfirm({
    title: 'Sync AI Providers from Netskope',
    subtitle: 'This will overwrite your current provider configuration',
    body: 'All AI provider settings (tokens, model selections, visibility) will be reset to what is currently configured in your Netskope tenant. Any manual changes you have made will be lost.',
    okLabel: 'Sync',
    onOk: async () => {
      const btn = document.getElementById('retrieve-providers-btn');
      const label = document.getElementById('sync-ai-label');
      btn.disabled = true;
      label.textContent = 'Syncing…';
      try {
        const res = await apiFetch('/api/admin/aiproviders/retrieve', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) { alert(data.error || `Error ${res.status}`); return; }
        renderAiProvidersTable(data.providers);
      } catch (e) {
        alert('Failed: ' + e.message);
      } finally {
        btn.disabled = false;
        label.textContent = 'Sync from Netskope';
      }
    },
  });
}

let _aipModalId = null;

function openAipTokenModal(id, name, hasToken) {
  _aipModalId = id;
  document.getElementById('aip-modal-provider-name').textContent = name;
  const input = document.getElementById('aip-modal-token-input');
  input.value = hasToken ? '••••••••' : '';
  input.placeholder = hasToken ? 'Enter new token to replace, or leave as-is' : 'Paste your API token here…';
  document.getElementById('aip-modal-hint').textContent = hasToken
    ? 'Token is already configured. Paste a new value to replace it.'
    : 'This token will be stored securely and used to authenticate requests to this provider.';
  const modal = document.getElementById('aip-token-modal');
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}

function closeAipTokenModal() {
  document.getElementById('aip-token-modal').style.display = 'none';
  document.getElementById('aip-test-result').style.display = 'none';
  _aipModalId = null;
}

async function saveAipModalToken() {
  if (!_aipModalId) return;
  const val = document.getElementById('aip-modal-token-input').value;
  if (!val || val.startsWith('••••')) { closeAipTokenModal(); return; }
  await apiFetch(`/api/admin/aiproviders/${_aipModalId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_token: val })
  });
  closeAipTokenModal();
  loadAiProviders();
}

async function testAipToken() {
  if (!_aipModalId) return;
  const btn = document.getElementById('aip-test-btn');
  const resultEl = document.getElementById('aip-test-result');
  const inputVal = document.getElementById('aip-modal-token-input').value;
  const body = {};
  if (inputVal && !inputVal.startsWith('••••')) body.api_token = inputVal;
  btn.disabled = true;
  btn.textContent = 'Testing…';
  resultEl.style.display = 'none';
  try {
    const res = await apiFetch(`/api/admin/aiproviders/${_aipModalId}/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const d = await res.json();
    resultEl.style.display = 'block';
    if (d.ok) {
      resultEl.style.background = 'rgba(34,197,94,0.1)';
      resultEl.style.border = '1px solid rgba(34,197,94,0.3)';
      resultEl.style.color = 'var(--success, #22c55e)';
      resultEl.textContent = `✓ OK (${d.status})  →  ${d.reply}`;
    } else {
      resultEl.style.background = 'rgba(248,113,113,0.1)';
      resultEl.style.border = '1px solid rgba(248,113,113,0.3)';
      resultEl.style.color = 'var(--danger, #f87171)';
      resultEl.textContent = `✗ ${d.status ? `HTTP ${d.status}  ` : ''}${d.error || 'Unknown error'}`;
    }
  } catch (e) {
    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(248,113,113,0.1)';
    resultEl.style.border = '1px solid rgba(248,113,113,0.3)';
    resultEl.style.color = 'var(--danger, #f87171)';
    resultEl.textContent = `✗ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test';
  }
}

function openAipModelsModal(id, name, modelsJson) {
  const provider = _aiProviders.find(x => x.id === id);
  const savedIds = (() => { try { return JSON.parse(modelsJson); } catch { return []; } })();

  // Resolve the available models from MODELS using provider name/schema
  const nameLower = (provider?.name || '').toLowerCase();
  const NAME_SCHEMA_MAP = [
    ['mistral','mistral'],['anthropic','anthropic'],['claude','claude'],
    ['gemini','gemini'],['google','google'],['bedrock','bedrock'],
    ['deepseek','deepseek'],['xai','xai'],['grok','xai'],
    ['perplexity','perplexity'],['cohere','cohere'],['openai','openai'],
  ];
  let schemaKey = provider?.schema || 'openai';
  for (const [kw, k] of NAME_SCHEMA_MAP) { if (nameLower.includes(kw)) { schemaKey = k; break; } }
  const availableModels = MODELS[schemaKey] || [];

  window.aipModelsSave = async () => {
    const checked = [...document.querySelectorAll('#aip-models-checks input[type=checkbox]:checked')].map(cb => cb.value);
    await apiFetch(`/api/admin/aiproviders/${id}`, { method: 'PUT', body: JSON.stringify({ models: checked }) });
    document.getElementById('aip-models-modal').remove();
    loadAiProviders();
  };

  const modal = document.createElement('div');
  modal.id = 'aip-models-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const anyMatch = savedIds.some(id => availableModels.find(m => m.value === id || m.label === id));
  const customIds = savedIds.filter(id => !availableModels.find(m => m.value === id || m.label === id));
  const allModels = [
    ...availableModels,
    ...customIds.map(id => ({ value: id, label: id, custom: true })),
  ];
  const checkboxes = allModels.map(m => {
    const checked = !anyMatch || savedIds.includes(m.value) || savedIds.includes(m.label) ? 'checked' : '';
    const tag = m.custom
      ? `<span style="font-size:11px;color:var(--accent);font-family:monospace;">custom</span>`
      : `<span style="font-size:11px;color:var(--text-muted);font-family:monospace;">${escapeHtml(m.value)}</span>`;
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary);padding:4px 0;">
      <input type="checkbox" value="${escapeHtml(m.value)}" ${checked} style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;" />
      <span>${escapeHtml(m.label)}</span>
      ${tag}
    </label>`;
  }).join('');

  window.aipModelsAddCustom = () => {
    const input = document.getElementById('aip-custom-model-input');
    const val = input.value.trim();
    if (!val) return;
    const container = document.getElementById('aip-models-checks');
    if (container.querySelector(`input[value="${CSS.escape(val)}"]`)) { input.value = ''; return; }
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary);padding:4px 0;';
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(val)}" checked style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;" />
      <span>${escapeHtml(val)}</span>
      <span style="font-size:11px;color:var(--accent);font-family:monospace;">custom</span>`;
    container.appendChild(label);
    input.value = '';
  };

  modal.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;padding:28px;width:520px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <strong style="font-size:15px;font-weight:700;color:var(--text-primary);">${escapeHtml(name)} — Models</strong>
        <button onclick="document.getElementById('aip-models-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1;">×</button>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Select which models participants can choose from.</p>
      <div id="aip-models-checks" style="display:flex;flex-direction:column;gap:2px;margin-bottom:16px;max-height:260px;overflow-y:auto;">
        ${checkboxes || '<p style="font-size:12px;color:var(--text-muted);">No models available for this schema.</p>'}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:20px;">
        <input id="aip-custom-model-input" type="text" placeholder="Add custom model ID…"
          style="flex:1;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);color:var(--text-primary);outline:none;"
          onkeydown="if(event.key==='Enter'){event.preventDefault();aipModelsAddCustom();}" />
        <button class="btn-secondary" onclick="aipModelsAddCustom()" style="padding:6px 12px;font-size:12px;">Add</button>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn-secondary" onclick="document.getElementById('aip-models-modal').remove()" style="padding:6px 12px;font-size:12px;">Cancel</button>
        <button class="btn-primary" onclick="aipModelsSave()" style="padding:6px 12px;font-size:12px;">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function toggleAiProviderVisible(id, visible, btn = null) {
  const nextVisible = visible ? 1 : 0;
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = rowActionIcon('working'); }
    const res = await apiFetch(`/api/admin/aiproviders/${id}`, { method: 'PUT', body: JSON.stringify({ visible: nextVisible }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const provider = _aiProviders.find(p => Number(p.id) === Number(id));
    if (provider) provider.visible = nextVisible;
    renderAiProvidersTable(_aiProviders);
  } catch (e) {
    if (btn) btn.disabled = false;
    showAlert(adminT('state_error'), e.message);
  }
}

function openAddAipModal() {
  const schemas = ['openai','anthropic','gemini','mistral','deepseek','xai','perplexity','cohere','bedrock'];
  const schemaOptions = schemas.map(s => `<option value="${s}">${s}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'add-aip-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;padding:28px;width:440px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">Add Provider</h3>
        <button onclick="document.getElementById('add-aip-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1;">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <label style="font-size:13px;color:var(--text-secondary);">Name *
          <input id="add-aip-name" type="text" placeholder="e.g. openai" style="display:block;margin-top:4px;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;" />
        </label>
        <label style="font-size:13px;color:var(--text-secondary);">Schema *
          <select id="add-aip-schema" style="display:block;margin-top:4px;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;">${schemaOptions}</select>
        </label>
        <label style="font-size:13px;color:var(--text-secondary);">Host (optional)
          <input id="add-aip-host" type="text" placeholder="e.g. api.openai.com" style="display:block;margin-top:4px;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;" />
        </label>
        <label style="font-size:13px;color:var(--text-secondary);">API Token (optional)
          <input id="add-aip-token" type="password" placeholder="sk-..." autocomplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" style="display:block;margin-top:4px;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;" />
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-top:22px;">
        <button onclick="document.getElementById('add-aip-modal').remove()" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;">Cancel</button>
        <button onclick="saveNewAipProvider()" style="flex:3;padding:9px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function saveNewAipProvider() {
  const name = document.getElementById('add-aip-name').value.trim();
  const schema = document.getElementById('add-aip-schema').value;
  const host = document.getElementById('add-aip-host').value.trim();
  const token = document.getElementById('add-aip-token').value.trim();
  if (!name) { alert('Name is required'); return; }
  const models = (MODELS[schema] || []).map(m => m.value);
  const res = await apiFetch('/api/admin/aiproviders', {
    method: 'POST',
    body: JSON.stringify({ name, schema, host: host || null, api_token: token || null, models })
  });
  if (!res.ok) { const e = await res.json(); alert(e.error || 'Error'); return; }
  document.getElementById('add-aip-modal').remove();
  loadAiProviders();
}

async function deleteManualAipProvider(id) {
  if (!confirm('Delete this provider?')) return;
  const res = await apiFetch(`/api/admin/aiproviders/${id}`, { method: 'DELETE' });
  if (!res.ok) { const e = await res.json(); alert(e.error || 'Error'); return; }
  loadAiProviders();
}

function updateAiProvidersToggleAllButton() {
  const btn = document.getElementById('aip-toggle-all-btn');
  if (!btn) return;
  const allVisible = _aiProviders.length > 0 && _aiProviders.every(p => promptIsVisible(p.visible));
  btn.disabled = _aiProviders.length === 0;
  btn.title = allVisible ? 'Hide all AI providers' : 'Show all AI providers';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = rowActionIcon(allVisible ? 'hidden' : 'visible');
}

async function toggleAllAiProvidersVisible() {
  if (!_aiProviders.length) return;
  const nextVisible = _aiProviders.every(p => promptIsVisible(p.visible)) ? 0 : 1;
  const btn = document.getElementById('aip-toggle-all-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = rowActionIcon('working'); }
  try {
    await Promise.all(_aiProviders.map(p => apiFetch(`/api/admin/aiproviders/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({ visible: nextVisible })
    }).then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); })));
    _aiProviders.forEach(p => { p.visible = nextVisible; });
    renderAiProvidersTable(_aiProviders);
  } catch (e) {
    showAlert(adminT('state_error'), e.message);
    updateAiProvidersToggleAllButton();
  }
}

const HELP_TITLES = {
  dashboard: 'Dashboard', control: 'Control Center', participants: 'Participants', challenges: 'Challenges',
  gwtokens: 'GW Tokens', aiproviders: 'AI Providers', mcp: 'MCP Servers',
  prompts: 'Prompt Library', conversations: 'Conversations',
  admins: 'Admins', settings: 'Global Settings', prerequisites: 'Prerequisites'
};

function openHelpSidebar(section) {
  document.querySelectorAll('.help-panel').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById(`help-${section}`);
  if (panel) panel.classList.add('active');
  document.getElementById('help-sidebar-title').textContent = HELP_TITLES[section] || 'Help';
  document.getElementById('help-sidebar').classList.add('open');
  document.getElementById('help-sidebar-overlay').classList.add('open');
}

function closeHelpSidebar() {
  document.getElementById('help-sidebar').classList.remove('open');
  document.getElementById('help-sidebar-overlay').classList.remove('open');
}

function _buildPodiumHtml(podData) {
  const top = podData.rows || [];
  if (!top.length) return '<div class="dash-podium-empty">No challenge completions yet.</div>';
  const slots = [top[1], top[0], top[2]];
  const ranks = [2, 1, 3];
  const medals = ['🥈', '🥇', '🥉'];
  return `<div class="dash-podium-stage">
    ${slots.map((s, i) => s ? `
      <div class="podium-slot podium-slot--${ranks[i]}">
        <div class="podium-avatar">${s.icon || escapeHtml(s.participant_code.slice(0, 4))}</div>
        <div class="podium-name">${escapeHtml(s.participant_code)}</div>
        <div class="podium-score">${s.completed}/${podData.total}</div>
        <div class="podium-bar" style="flex-direction:row;gap:10px;align-items:center;">
          <span style="font-size:0.9em;line-height:1;">${medals[i]}</span>
          <span class="podium-pts-label">${s.total_points}<span style="font-size:0.55em;font-weight:500;opacity:.85;"> pts</span></span>
        </div>
      </div>` : `<div class="podium-slot podium-slot--${ranks[i]}"><div class="podium-bar podium-bar--empty">—</div></div>`
    ).join('')}
  </div>`;
}

// Concept C leaderboard list — shared by the participant panel and the admin
// dashboard card. rows: [{ participant_code, icon, completed, total_points }].
function _renderLeaderboardC(rows, total, currentCode) {
  if (!rows || !rows.length) return '<div class="lb-c-empty">No completions yet.</div>';
  const medals = ['🥇', '🥈', '🥉'];
  const tiers = ['gold', 'silver', 'bronze'];
  const flag = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
  return '<div class="lb-c">' + rows.map((r, i) => {
    const top = i < 3;
    const cls = 'lb-c-row'
      + (top ? ` lb-c-row--top lb-c-row--${tiers[i]}` : '')
      + (currentCode && r.participant_code === currentCode ? ' lb-c-row--me' : '');
    const lead = top ? `<span class="lb-c-medal">${medals[i]}</span>` : `<span class="lb-c-rank">${i + 1}</span>`;
    const bg = top ? '<span class="lb-c-bg"></span>' : '';
    const sub = (typeof r.completed === 'number')
      ? `<div class="lb-c-sub">${flag}${r.completed}/${total}</div>` : '';
    return `<div class="${cls}" onclick="showChallengeDetail('${escHtml(r.participant_code)}')" style="cursor:pointer;" title="Click to view challenge details">${bg}${lead}`
      + `<span class="lb-c-av">${r.icon || '🎓'}</span>`
      + `<div class="lb-c-main"><div class="lb-c-name">${escHtml(r.participant_code)}</div>${sub}</div>`
      + `<div class="lb-c-pts"><b>${r.total_points}</b><small>pts</small></div>`
      + '</div>';
  }).join('') + '</div>';
}

async function refreshPodium() {
  const el = document.getElementById('dash-podium');
  if (!el) return;
  const res = await apiFetch('/api/challenges/leaderboard').catch(() => null);
  const data = res?.ok ? await res.json() : { total: 0, rows: [] };
  el.innerHTML = _renderLeaderboardC((data.rows || []).slice(0, 5), data.total);
}

/* ── Award ceremony: synced to "Absolute Champion" track (voice cues) ── */
function showAwardAnimation() {
  const triggerBtn = document.getElementById('award-ceremony-btn');
  if (triggerBtn) triggerBtn.disabled = true;

  apiFetch('/api/challenges/leaderboard')
    .then(r => r.json())
    .catch(() => ({ rows: [] }))
    .then((data) => {
      const rows = (data.rows || []).slice(0, 10);
      if (triggerBtn) triggerBtn.disabled = false;
      if (!rows.length) { showAlert('No data', 'No participants to show yet.'); return; }

      const medals = ['🥇', '🥈', '🥉'];
      const el = (cls, html) => { const d = document.createElement('div'); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };

      // Voice cues in the track (seconds): "Third place" ~0:30, "Second" ~0:41, "First" ~0:52.
      const CUES = { 3: 30.0, 2: 41.0, 1: 52.0 };

      const overlay = el('award-overlay');
      const stage = el('award-stage');
      overlay.appendChild(stage);

      const audio = new Audio('/audio/absolute-champion.mp3');
      audio.preload = 'auto';

      let slots = {};
      const revealed = {};

      const burstConfetti = (count) => {
        const colors = ['#fbbf24', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#ef4444', '#ffffff', '#fde047', '#06b6d4'];
        for (let i = 0; i < count; i++) {
          const c = document.createElement('div');
          c.className = 'award-confetti';
          const size = 9 + Math.random() * 13;
          c.style.left = Math.random() * 100 + '%';
          c.style.width = size + 'px';
          c.style.height = (size * (0.5 + Math.random())) + 'px';
          c.style.background = colors[Math.floor(Math.random() * colors.length)];
          c.style.animationDelay = (Math.random() * 0.9) + 's';
          c.style.animationDuration = (3 + Math.random() * 2.8) + 's';
          c.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
          c.style.setProperty('--drift', (Math.random() * 280 - 140) + 'px');
          if (Math.random() > 0.5) c.style.borderRadius = '50%';
          overlay.appendChild(c);
          setTimeout(() => c.remove(), 6200);
        }
      };
      const flash = () => { const f = el('award-flash'); overlay.appendChild(f); setTimeout(() => f.remove(), 700); };

      const revealRank = (rank) => {
        if (revealed[rank] || !slots[rank]) return;
        revealed[rank] = true;
        const place = slots[rank];
        place.classList.add('award-place--spot');
        setTimeout(() => place.classList.remove('award-place--spot'), 1500);
        place.classList.add('award-revealed');
        if (rank === 1) {
          place.classList.add('award-winner');
          flash();
          overlay.classList.add('award-shake');
          setTimeout(() => overlay.classList.remove('award-shake'), 700);
          burstConfetti(340);
        }
      };

      let runnerQueue = [];
      const onTime = () => {
        const t = audio.currentTime;
        runnerQueue.forEach(item => { if (!item.shown && t >= item.t) { item.shown = true; item.el.classList.add('award-runner--show'); } });
        if (t >= CUES[3]) revealRank(3);
        if (t >= CUES[2]) revealRank(2);
        if (t >= CUES[1]) revealRank(1);
      };
      audio.addEventListener('timeupdate', onTime);

      const close = () => {
        audio.pause();
        audio.removeEventListener('timeupdate', onTime);
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('award-overlay--out');
        setTimeout(() => overlay.remove(), 450);
      };
      let started = false;
      const start = () => {
        if (!started) { started = true; build(); try { audio.currentTime = 0; } catch (e) {} }
        else if (audio.ended) { try { audio.currentTime = 0; } catch (e) {} }
        audio.play().catch(() => {});
      };
      const stop = () => { audio.pause(); };
      const replay = () => {
        started = true;
        build();
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
        audio.play().catch(() => {});
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close();
        else if (e.key.toLowerCase() === 'r') replay();
        else if (e.key === ' ') { e.preventDefault(); audio.paused ? start() : stop(); }
      };
      document.addEventListener('keydown', onKey);

      const mkBtn = (cls, html, title, fn) => {
        const b = document.createElement('button');
        b.className = 'award-ctrl-btn' + (cls ? ' ' + cls : '');
        b.innerHTML = html; b.title = title; b.onclick = fn;
        return b;
      };
      const controls = el('award-controls');
      controls.appendChild(mkBtn('award-ctrl-btn--start', '▶', 'Start (Space)', start));
      controls.appendChild(mkBtn('', '⏸', 'Stop (Space)', stop));
      controls.appendChild(mkBtn('', '↻', 'Replay (R)', replay));
      controls.appendChild(mkBtn('award-ctrl-btn--close', '✕', 'Close (Esc)', close));
      overlay.appendChild(controls);

      document.body.appendChild(overlay);

      const TITLE_HTML = '<span class="award-trophy">🏆</span><span class="award-title-text">FINAL RANKINGS</span><span class="award-trophy">🏆</span>';

      function showReady() {
        Object.keys(revealed).forEach(k => delete revealed[k]);
        overlay.querySelectorAll('.award-confetti, .award-flash').forEach(n => n.remove());
        overlay.classList.remove('award-shake');
        stage.className = 'award-stage award-stage--ready';
        stage.innerHTML = '';
        stage.appendChild(el('award-title', TITLE_HTML));
        const ready = el('award-ready', '<span>▶</span> Press <b>Start</b> to begin the ceremony');
        ready.onclick = start;
        stage.appendChild(ready);
      }

      function build() {
        Object.keys(revealed).forEach(k => delete revealed[k]);
        overlay.querySelectorAll('.award-confetti, .award-flash').forEach(n => n.remove());
        overlay.classList.remove('award-shake');
        stage.className = 'award-stage';
        stage.innerHTML = '';

        const title = el('award-title award-title--top', TITLE_HTML);
        stage.appendChild(title);

        const main = el('award-main');

        // Podium (left) — pedestals visible from the start, figures hidden until each cue.
        const top3 = rows.slice(0, 3);
        const podium = el('award-podium');
        slots = {};
        [2, 1, 3].forEach(rank => {
          const r = top3[rank - 1];
          if (!r) return;
          const place = el('award-place award-place--' + rank);
          place.innerHTML =
            '<div class="award-figure">' +
              '<div class="award-avatar">' + (r.icon || '🎓') + '</div>' +
              '<div class="award-name">' + escHtml(r.participant_code) + '</div>' +
              '<div class="award-pts">' + r.total_points + ' pts</div>' +
            '</div>' +
            '<div class="award-pedestal award-pedestal--' + rank + '">' +
              '<span class="award-medal award-medal--hidden">' + medals[rank - 1] + '</span>' +
            '</div>';
          podium.appendChild(place);
          slots[rank] = place;
        });
        main.appendChild(podium);

        // Runners-up (right) — revealed one by one between 0:05 and 0:25 (driven by
        // the audio clock in onTime) so the wait until the first podium cue at 0:30
        // isn't dead time. ranks 4..10 of the top 10.
        const rest = rows.slice(3);
        runnerQueue = [];
        if (rest.length) {
          const list = el('award-runners');
          const n = rest.length;
          rest.forEach((r, i) => {
            const row = el('award-runner');
            row.innerHTML =
              '<span class="award-runner-rank">#' + (i + 4) + '</span>' +
              '<span class="award-runner-av">' + (r.icon || '🎓') + '</span>' +
              '<span class="award-runner-name">' + escHtml(r.participant_code) + '</span>' +
              '<span class="award-runner-pts">' + r.total_points + ' pts</span>';
            list.appendChild(row);
            // Reveal lowest-ranked first: #10 at 0:05, working up to #4 at 0:25.
            const t = n > 1 ? 5 + ((n - 1 - i) * 20 / (n - 1)) : 5;
            runnerQueue.push({ el: row, t: t, shown: false });
          });
          main.appendChild(list);
        }

        stage.appendChild(main);
      }

      showReady(); // static "ready" screen — nothing runs until the audience presses ▶ Start
    });
}

async function refreshPodiumFs() {
  const el = document.getElementById('dash-podium-fs');
  const rankEl = document.getElementById('dash-podium-fs-ranking');
  if (!el) return;

  const [podRes, lbRes] = await Promise.all([
    apiFetch('/api/challenges/podium').catch(() => null),
    apiFetch('/api/challenges/leaderboard').catch(() => null),
  ]);
  const podData = podRes?.ok ? await podRes.json() : { total: 0, rows: [] };
  const lbData = lbRes?.ok ? await lbRes.json() : { total: 0, rows: [] };

  el.innerHTML = _buildPodiumHtml(podData);

  if (rankEl) {
    const rest = (lbData.rows || []).slice(3, 10); // positions 4-10
    if (!rest.length) {
      rankEl.innerHTML = '<div class="podium-fs-ranking-title">4 – 10</div><div style="color:var(--text-muted);font-size:13px;">No more participants yet.</div>';
    } else {
      rankEl.innerHTML = `<div class="podium-fs-ranking-title">4 – 10</div>` +
        rest.map((r, i) => `
          <div class="podium-fs-rank-row">
            <span class="podium-fs-rank-num">#${i + 4}</span>
            <span style="font-size:16px;">${r.icon || '🎓'}</span>
            <span class="podium-fs-rank-code">${escapeHtml(r.participant_code)}</span>
            <span class="podium-fs-rank-sub">${r.completed}/${lbData.total}</span>
            <span class="podium-fs-rank-pts">${r.total_points} pts</span>
          </div>`
        ).join('');
    }
  }
}

let _podiumAutorefreshInterval = null;

function openPodiumFullscreen() {
  const overlay = document.getElementById('podium-overlay');
  // The overlay lives inside the Dashboard section; if it's not the active
  // section (e.g. opened from Control Center) its hidden ancestor would keep it
  // invisible. It's position:fixed, so reparent it to <body> to show on top.
  if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
  overlay.style.display = 'flex';
  refreshPodiumFs();
}

function closePodiumFullscreen() {
  document.getElementById('podium-overlay').style.display = 'none';
  if (_podiumAutorefreshInterval) {
    clearInterval(_podiumAutorefreshInterval);
    _podiumAutorefreshInterval = null;
    const btn = document.getElementById('podium-autorefresh-btn');
    if (btn) btn.classList.remove('podium-autorefresh-active');
  }
}

function togglePodiumAutorefresh() {
  const btn = document.getElementById('podium-autorefresh-btn');
  if (_podiumAutorefreshInterval) {
    clearInterval(_podiumAutorefreshInterval);
    _podiumAutorefreshInterval = null;
    btn.classList.remove('podium-autorefresh-active');
  } else {
    _podiumAutorefreshInterval = setInterval(refreshPodiumFs, 30000);
    btn.classList.add('podium-autorefresh-active');
    refreshPodiumFs();
  }
}

async function loadDashboard() {
  if (_loadingDashboard) return;
  _loadingDashboard = true;
  try {
    await loadAdminI18n();
    loadCTFState();
    loadRegOpen();
  const safeFetch = async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await apiFetch(url);
        // Definitive HTTP response — including a 5xx like the MCP-servers 502
        // returned when the Netskope tenant is unreachable. Don't burn ~2.4s of
        // retry-backoff on it: a down upstream keeps failing and the readiness
        // count is best-effort. Fail fast so it never blocks the dashboard.
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        // Network blip only (connection dropped, etc.) — short retry.
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    return [];
  };
  const [codesRes, promptLibRes, mcpRes, aiProvidersRes, challengesRes] = await Promise.all([
    safeFetch('/api/admin/codes'),
    safeFetch('/api/admin/prompt-library'),
    safeFetch('/api/admin/mcp-servers'),
    safeFetch('/api/admin/aiproviders'),
    safeFetch('/api/challenges'),
  ]);
  const codes = Array.isArray(codesRes) ? codesRes : [];
  const students = codes.filter(c => c.role !== 'admin');
  const maxP = 100;
  const promptLibCount = Array.isArray(promptLibRes) ? promptLibRes.length : 0;
  const mcpServers = Array.isArray(mcpRes) ? mcpRes : [];
  const aiProviders = Array.isArray(aiProvidersRes) ? aiProvidersRes : [];
  const challenges = Array.isArray(challengesRes) ? challengesRes : [];
  const visibleMcpCount = mcpServers.filter(s => Number(s.visible) === 1 || s.visible === true).length;
  const visibleAiProviderCount = aiProviders.filter(p => Number(p.visible) === 1 || p.visible === true).length;
  const visibleChallengeCount = challenges.filter(c => Number(c.visible) === 1 || c.visible === true).length;
  const mcpCount = mcpServers.length;
  const aiProviderCount = aiProviders.length;
  const challengeCount = challenges.length;

  const readinessChecks = [];
  const setReadiness = (key, ready, text) => {
    readinessChecks.push({ key, ready });
    const status = document.getElementById(`ready-${key}-status`);
    const dot = document.getElementById(`ready-${key}-dot`);
    if (status) {
      status.textContent = text;
      status.classList.toggle('is-ready', ready);
      status.classList.toggle('is-missing', !ready);
    }
    if (dot) {
      dot.classList.toggle('is-ready', ready);
      dot.classList.toggle('is-missing', !ready);
    }
  };
  setReadiness('participants', students.length > 0, students.length > 0 ? adminT('ready_count_ready', { count: students.length }) : 'No participants');
  setReadiness('providers', visibleAiProviderCount > 0, aiProviderCount > 0 ? adminT('ready_count_visible', { visible: visibleAiProviderCount, total: aiProviderCount }) : 'No providers configured');
  setReadiness('mcp', visibleMcpCount > 0, mcpCount > 0 ? adminT('ready_count_visible', { visible: visibleMcpCount, total: mcpCount }) : 'No MCP servers');
  setReadiness('prompts', promptLibCount > 0, promptLibCount > 0 ? adminT('ready_count_prompts', { count: promptLibCount }) : 'No prompts');
  setReadiness('challenges', visibleChallengeCount > 0, challengeCount > 0 ? adminT('ready_count_visible', { visible: visibleChallengeCount, total: challengeCount }) : 'No challenges');
  const summary = document.getElementById('readiness-summary');
  if (summary) {
    const readyCount = readinessChecks.filter(item => item.ready).length;
    const totalCount = readinessChecks.length;
    summary.textContent = `${readyCount}/${totalCount} ready`;
    summary.classList.toggle('is-ready', readyCount === totalCount);
    summary.classList.toggle('is-missing', readyCount < totalCount);
  }

  // Podium
  await refreshPodium();
  if (document.getElementById('podium-overlay')?.style.display !== 'none') {
    await refreshPodiumFs();
  }

  const tbody = document.getElementById('dash-participants-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const lbRes = await apiFetch('/api/challenges/leaderboard').catch(() => null);
  const lbData = lbRes?.ok ? await lbRes.json() : { total: 0, rows: [] };
  const totalChallenges = lbData.total || 0;
  const lbRows = lbData.rows || [];

  // Build rank map (by points, already sorted desc)
  const rankMap = Object.fromEntries(lbRows.map((r, i) => [r.participant_code, { rank: i + 1, completed: r.completed, total_points: r.total_points }]));

  // Sort students by rank (ranked first, then unranked alphabetically)
  const sortedStudents = [...students].sort((a, b) => {
    const ra = rankMap[a.code]?.rank ?? 9999;
    const rb = rankMap[b.code]?.rank ?? 9999;
    return ra !== rb ? ra - rb : a.code.localeCompare(b.code);
  });

  const c_ = 'text-align:center;vertical-align:middle;';
  sortedStudents.forEach((c, idx) => {
    const used = c.prompt_count || 0;
    const pct = Math.min(100, Math.round((used / maxP) * 100));
    const barColor = pct >= 100 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'var(--success)';
    const secured = c.prompt_count_secured || 0;
    const direct = c.prompt_count_direct || 0;
    const entry = rankMap[c.code] || { rank: null, completed: 0, total_points: 0 };
    const chDone = entry.completed;
    const chPoints = entry.total_points;
    const chPct = totalChallenges ? Math.round(chDone / totalChallenges * 100) : 0;
    const chColor = chPct >= 100 ? 'var(--success)' : chPct > 0 ? 'var(--warning)' : 'var(--text-muted)';
    const rankCell = entry.rank
      ? `<span style="font-size:11px;font-weight:700;color:var(--text-secondary);">#${entry.rank}</span>`
      : `<span style="color:var(--text-muted);">—</span>`;
    const ptsColor = chPoints > 0 ? 'var(--accent)' : 'var(--text-muted)';
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td style="text-align:center;vertical-align:middle;border-right:2px solid var(--border);white-space:nowrap;"><span style="font-size:18px;vertical-align:middle;margin-right:6px;">${c.icon || '🎓'}</span><code style="color:var(--accent);font-family:monospace;vertical-align:middle;">${escapeHtml(c.code)}</code></td>
        <td style="${c_}font-size:12px;color:${barColor};font-weight:600;border-right:2px solid var(--border);">${used}/${maxP}</td>
        <td style="${c_}font-size:12px;color:var(--route-secured);font-weight:600;">${secured}</td>
        <td style="${c_}font-size:12px;color:var(--route-direct);font-weight:600;border-right:2px solid var(--border);">${direct}</td>
        <td style="${c_}font-size:12px;font-weight:600;color:${chColor};border-right:2px solid var(--border);">${chDone}/${totalChallenges}</td>
        <td style="${c_}font-size:12px;font-weight:700;color:${ptsColor};">${chPoints > 0 ? chPoints + ' pts' : '—'}</td>
      </tr>`);
  });
  } finally {
    _loadingDashboard = false;
  }
}

// ── Access Codes ──

let _maxPrompts = 100;

function rowActionIcon(type) {
  if (type === 'move-up') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m18 15-6-6-6 6"/></svg>';
  }
  if (type === 'move-down') {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>';
  }
  if (type === 'edit') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  }
  if (type === 'detail') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  if (type === 'visible') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  if (type === 'hidden') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 3l18 18"/><path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"/><path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6 0 10 8 10 8a17.8 17.8 0 0 1-3.1 4.2"/><path d="M6.6 6.6C3.7 8.5 2 12 2 12s4 8 10 8a9.9 9.9 0 0 0 5.4-1.6"/></svg>';
  }
  if (type === 'save') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M20 6 9 17l-5-5"/></svg>';
  }
  if (type === 'policy-add') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>';
  }
  if (type === 'policy-delete') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M15 12l-6 6"/><path d="M9 12l6 6"/></svg>';
  }
  if (type === 'delete-student') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  }
  if (type === 'reset') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
  }
  if (type === 'working') {
    return '<span class="row-icon-spinner"></span>';
  }
  if (type === 'success') {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>';
  }
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';
}

async function loadAdminCodes() {
  if (_loadingAdminCodes) return;
  _loadingAdminCodes = true;
  try {
    let codesRes, mpRes, lbRes;
    try {
      [codesRes, mpRes, lbRes] = await Promise.all([
        apiFetch('/api/admin/codes'),
        apiFetch('/api/admin/settings/max-prompts'),
        apiFetch('/api/challenges/leaderboard')
      ]);
    } catch (e) {
      console.error('loadAdminCodes fetch error', e);
      return;
    }
    let codes = [], mpData = {}, lbData = { total: 0, rows: [] };
    try {
      codes = await codesRes.json();
      mpData = await mpRes.json();
      lbData = lbRes.ok ? await lbRes.json() : { total: 0, rows: [] };
    } catch (e) {
      console.error('loadAdminCodes parse error', e);
    }
    _maxPrompts = mpData.max_prompts || 100;
    const totalChallenges = lbData.total || 0;
    const completionMap = Object.fromEntries((lbData.rows || []).map(r => [r.participant_code, r.completed]));

    const tbody = document.getElementById('codes-tbody');
    tbody.innerHTML = (Array.isArray(codes) ? codes : []).filter(c => c.role !== 'admin').map(c => {
      const used = c.prompt_count || 0;
      const pct = Math.min(100, Math.round(used / _maxPrompts * 100));
      const barColor = pct >= 100 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'var(--success)';
      const secured = c.prompt_count_secured || 0;
      const direct = c.prompt_count_direct || 0;
      const chDone = completionMap[c.code] || 0;
      const chPct = totalChallenges ? Math.round(chDone / totalChallenges * 100) : 0;
      const chColor = chPct >= 100 ? 'var(--success)' : chPct > 0 ? 'var(--warning)' : 'var(--text-muted)';
      const c_ = 'text-align:center;vertical-align:middle;';
      return `<tr data-code="${escapeHtml(c.code)}">
        <td style="text-align:center;vertical-align:middle;border-right:2px solid var(--border);white-space:nowrap;"><span style="font-size:18px;vertical-align:middle;margin-right:6px;">${c.icon || '🎓'}</span><strong style="color:var(--text-primary);vertical-align:middle;">${escapeHtml(c.username || c.code)}</strong></td>
        <td style="font-size:12px;color:var(--text-muted);vertical-align:middle;border-right:2px solid var(--border);">${escapeHtml(c.netskope_token_group_name || '—')}</td>
        <td style="${c_}font-size:12px;color:${barColor};font-weight:600;border-left:2px solid var(--border);">${used}/${_maxPrompts}</td>
        <td style="${c_}font-size:12px;color:var(--route-secured);font-weight:600;">${secured}</td>
        <td style="${c_}font-size:12px;color:var(--route-direct);font-weight:600;">${direct}</td>
        <td style="${c_}border-right:2px solid var(--border);"><button class="row-icon-btn" onclick="resetPrompts('${c.code}')" title="Reset prompt counters">${rowActionIcon('reset')}</button></td>
        <td style="${c_}font-size:12px;font-weight:600;color:${chColor};">${chDone}/${totalChallenges}</td>
        <td style="${c_}"><button class="row-icon-btn" onclick="showChallengeDetail('${c.code}', this)" title="Challenge detail">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button></td>
        <td style="${c_}border-right:2px solid var(--border);"><button class="row-icon-btn" onclick="resetChallenges('${c.code}')" title="Reset challenge progress">${rowActionIcon('reset')}</button></td>
        <td style="${c_}"><button class="row-icon-btn row-icon-btn--policy" onclick="addNetskopePolicy('${c.code}', this)" data-tooltip="${escapeHtml(adminT('participant_policy_info_add'))}">${rowActionIcon('policy-add')}</button></td>
        <td style="${c_}border-right:2px solid var(--border);"><button class="row-icon-btn row-icon-btn--policy-danger" onclick="deleteNetskopePolicy('${c.code}', this)" data-tooltip="${escapeHtml(adminT('participant_policy_info_delete'))}">${rowActionIcon('policy-delete')}</button></td>
        <td style="${c_}"><button class="row-icon-btn row-icon-btn--danger" onclick="deleteCode('${c.code}')" title="${adminT('participant_action_delete_participant')}">${rowActionIcon('delete-student')}</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:24px;">${adminT('state_no_access_codes')}</td></tr>`;
  } finally {
    _loadingAdminCodes = false;
  }
}

async function resetChallenges(code) {
  showConfirm({ title: `Reset CTF progress — ${code}`, body: 'All challenge completions, penalties and hints for this participant will be deleted. This cannot be undone.', okLabel: 'Reset', onOk: async () => {
    await apiFetch(`/api/challenges/participants/${encodeURIComponent(code)}/reset`, { method: 'POST' });
    loadAdminCodes();
  }});
}

function closeCtfSidebar() {
  document.getElementById('ctf-sidebar')?.classList.remove('open');
  document.getElementById('ctf-sidebar-overlay')?.classList.remove('open');
}

async function showChallengeDetail(code, _btn) {
  const res = await apiFetch(`/api/challenges/participants/${encodeURIComponent(code)}/completions`);
  const { history, total, total_points, challenges } = await res.json();
  const completed = challenges.filter(c => c.completed).length;
  const hintsUsed = challenges.filter(c => c.hint_used).length;
  const failedAttempts = challenges.reduce((s, c) => s + c.failed_attempts, 0);

  // Header
  const nameEl = document.getElementById('ctf-sidebar-name');
  const subEl  = document.getElementById('ctf-sidebar-sub');
  if (nameEl) nameEl.textContent = code;
  if (subEl)  subEl.textContent  = `${completed} / ${total} challenges completed`;

  // Score strip
  const scoreEl = document.getElementById('ctf-sidebar-score');
  if (scoreEl) scoreEl.innerHTML = `
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value">${total_points}</div>
      <div class="ctf-sidebar-score-label">Total pts</div>
    </div>
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value">${completed}/${total}</div>
      <div class="ctf-sidebar-score-label">Done</div>
    </div>
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value" style="color:#f59e0b;">${hintsUsed}</div>
      <div class="ctf-sidebar-score-label">Hints used</div>
    </div>
    <div class="ctf-sidebar-score-item">
      <div class="ctf-sidebar-score-value" style="color:#ef4444;">${failedAttempts}</div>
      <div class="ctf-sidebar-score-label">Penalties</div>
    </div>`;

  // Timeline
  const tlEl = document.getElementById('ctf-sidebar-timeline');
  if (tlEl) {
    if (!history.length) {
      tlEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No activity yet.</div>';
    } else {
      tlEl.innerHTML = history.map(h => {
        const dt = new Date(h.ts + (h.ts.includes('Z') ? '' : 'Z'));
        const formatted = dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        let dotClass, iconSvg, ptsText, ptsColor, eventLabel;
        if (h.result === 'success') {
          dotClass  = 'ctf-sidebar-tl-dot--success';
          iconSvg   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
          ptsText   = `+${h.points_earned} pts`;
          ptsColor  = '#22c55e';
          eventLabel = 'Completed';
        } else if (h.result === 'hint') {
          dotClass  = 'ctf-sidebar-tl-dot--hint';
          iconSvg   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          ptsText   = '−5 pts';
          ptsColor  = '#f59e0b';
          eventLabel = 'Hint used';
        } else {
          dotClass  = 'ctf-sidebar-tl-dot--fail';
          iconSvg   = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          ptsText   = '−5 pts';
          ptsColor  = '#ef4444';
          eventLabel = 'Failed attempt';
        }
        return `<div class="ctf-sidebar-tl-item">
          <div class="ctf-sidebar-tl-dot ${dotClass}">${iconSvg}</div>
          <div class="ctf-sidebar-tl-body">
            <div class="ctf-sidebar-tl-title">#${h.order_num} ${escapeHtml(h.title)}</div>
            <div class="ctf-sidebar-tl-meta">${eventLabel} · ${formatted}</div>
          </div>
          <div class="ctf-sidebar-tl-pts" style="color:${ptsColor};">${ptsText}</div>
        </div>`;
      }).join('');
    }
  }

  // Open sidebar
  document.getElementById('ctf-sidebar')?.classList.add('open');
  document.getElementById('ctf-sidebar-overlay')?.classList.add('open');
}

// ── Bulk-create participants (random themed names) ──
function openBulkParticipantsModal() {
  document.getElementById('bulk-participants-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'bulk-participants-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;padding:28px;width:460px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">${adminT('bulk_modal_title')}</h3>
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1;">×</button>
      </div>
      <p style="margin:0 0 18px;font-size:13px;color:var(--text-secondary);line-height:1.5;">${adminT('bulk_modal_desc')}</p>
      <label style="font-size:13px;color:var(--text-secondary);">${adminT('bulk_modal_count_label')}
        <input id="bulk-count-input" type="number" min="1" max="25" value="10" style="display:block;margin-top:6px;width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:14px;" />
      </label>
      <div id="bulk-modal-error" style="display:none;margin-top:10px;font-size:12px;color:#ef4444;"></div>
      <div style="display:flex;gap:10px;margin-top:22px;">
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;">${adminT('modal_cancel')}</button>
        <button id="bulk-create-btn" onclick="submitBulkParticipants()" style="flex:2;padding:10px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">${adminT('bulk_modal_create_btn')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('bulk-count-input')?.focus(), 50);
}

async function submitBulkParticipants() {
  const input = document.getElementById('bulk-count-input');
  const errEl = document.getElementById('bulk-modal-error');
  const btn = document.getElementById('bulk-create-btn');
  const count = parseInt(input?.value, 10);
  if (!count || count < 1 || count > 25) {
    errEl.textContent = adminT('bulk_modal_range_err');
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.textContent = adminT('bulk_modal_creating');

  let res, data;
  try {
    res = await apiFetch('/api/admin/participants/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    data = await res.json();
  } catch (e) {
    errEl.textContent = e.message || 'Network error';
    errEl.style.display = 'block';
    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = adminT('bulk_modal_create_btn');
    return;
  }

  if (!res.ok) {
    errEl.textContent = data?.error || 'Error';
    errEl.style.display = 'block';
    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = adminT('bulk_modal_create_btn');
    return;
  }

  renderBulkParticipantsResult(data);
  loadAdminCodes();
  if (typeof loadDashboard === 'function') loadDashboard();
}

function renderBulkParticipantsResult(data) {
  const modal = document.getElementById('bulk-participants-modal');
  if (!modal) return;
  const rows = (data.created || []).map(c => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:7px 8px;font-size:13px;color:var(--text-primary);">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</td>
      <td style="padding:7px 8px;font-size:13px;color:var(--text-secondary);font-family:monospace;">${escapeHtml(c.password)}</td>
      <td style="padding:7px 8px;font-size:13px;text-align:center;">${c.error ? '<span style="color:#ef4444;">'+escapeHtml(c.error)+'</span>' : (c.token ? '<span style="color:#22c55e;">✓</span>' : '<span style="color:var(--text-muted);">—</span>')}</td>
    </tr>`).join('');
  const tokenNote = data.netskope_configured
    ? `${data.tokens_created}/${data.count} ${adminT('bulk_result_tokens_ok')}`
    : adminT('bulk_result_no_netskope');
  modal.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;padding:28px;width:520px;max-width:95vw;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">${adminT('bulk_result_title', { count: data.count })}</h3>
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1;">×</button>
      </div>
      <p style="margin:0 0 16px;font-size:12px;color:var(--text-secondary);">${tokenNote} · ${adminT('bulk_result_pw_note')}</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="padding:7px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">${adminT('bulk_col_name')}</th>
          <th style="padding:7px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">${adminT('bulk_col_password')}</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);">${adminT('bulk_col_token')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;gap:10px;margin-top:22px;">
        <button onclick="copyBulkParticipants()" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;">${adminT('bulk_result_copy')}</button>
        <button onclick="document.getElementById('bulk-participants-modal').remove()" style="flex:1;padding:10px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">${adminT('btn_done')}</button>
      </div>
    </div>`;
  window._lastBulkCreated = data.created || [];
}

function copyBulkParticipants() {
  const list = window._lastBulkCreated || [];
  const text = list.map(c => `${c.name}\t${c.password}`).join('\n');
  navigator.clipboard?.writeText(text);
}

async function addNetskopePolicy(code, btn) {
  const orig = btn.innerHTML;
  const origTitle = btn.title;
  btn.disabled = true;
  btn.innerHTML = rowActionIcon('working');
  btn.title = adminT('state_working');
  btn.style.color = '';
  try {
    const res = await apiFetch(`/api/admin/participants/${encodeURIComponent(code)}/netskope-policies`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      btn.innerHTML = rowActionIcon('success');
      btn.title = d.groupCreated ? adminT('state_created') : adminT('state_updated');
      btn.style.color = 'var(--success)';
      setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 4000);
    } else {
      showAlert(`Policy error — ${code}`, d.error || 'Unknown error');
      btn.innerHTML = rowActionIcon('error');
      btn.title = adminT('state_error');
      btn.style.color = 'var(--danger)';
      setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 6000);
    }
  } catch (e) {
    showAlert(`Policy error — ${code}`, e.message);
    btn.innerHTML = rowActionIcon('error');
    btn.title = adminT('state_error');
    btn.style.color = 'var(--danger)';
    setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 6000);
  } finally {
    btn.disabled = false;
  }
}

async function deleteNetskopePolicy(code, btn) {
  const orig = btn.innerHTML;
  const origTitle = btn.title;
  btn.disabled = true;
  btn.innerHTML = rowActionIcon('working');
  btn.title = adminT('state_working');
  btn.style.color = '';
  try {
    const res = await apiFetch(`/api/admin/participants/${encodeURIComponent(code)}/netskope-policies`, { method: 'DELETE' });
    const d = await res.json();
    if (res.ok) {
      btn.innerHTML = rowActionIcon('success');
      btn.title = adminT('state_deleted');
      btn.style.color = 'var(--success)';
      setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 4000);
    } else {
      showAlert(`Policy error — ${code}`, d.error || 'Unknown error');
      btn.innerHTML = rowActionIcon('error');
      btn.title = adminT('state_error');
      btn.style.color = 'var(--danger)';
      setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 6000);
    }
  } catch (e) {
    showAlert(`Policy error — ${code}`, e.message);
    btn.innerHTML = rowActionIcon('error');
    btn.title = adminT('state_error');
    btn.style.color = 'var(--danger)';
    setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 6000);
  } finally {
    btn.disabled = false;
  }
}

// Animate an "All …" header button (spinner while running, ✓/✗ on finish).
async function runAllAction(btn, fn) {
  let orig, origTitle;
  if (btn) {
    orig = btn.innerHTML;
    origTitle = btn.title;
    btn.disabled = true;
    btn.innerHTML = rowActionIcon('working');
    btn.title = adminT('state_working');
  }
  let failed = false;
  try {
    await fn();
  } catch (e) {
    failed = true;
    console.error('runAllAction error', e);
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = rowActionIcon(failed ? 'error' : 'success');
    btn.style.color = failed ? 'var(--danger)' : 'var(--success)';
    setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 3000);
  }
}

async function bulkAddNetskopePolicy(btn) {
  const rows = [...document.querySelectorAll('#codes-tbody tr')];
  const codes = rows.map(r => r.dataset.code).filter(Boolean);
  if (!codes.length) return;
  const orig = btn.innerHTML;
  const origTitle = btn.title;
  btn.disabled = true;
  btn.innerHTML = rowActionIcon('working');
  let ok = 0, errors = [];
  const guardrailsProfileIds = new Set();
  for (const code of codes) {
    btn.title = `${adminT('state_working')} (${ok + errors.length}/${codes.length})`;
    const res = await apiFetch(`/api/admin/participants/${encodeURIComponent(code)}/netskope-policies?skip_deploy=true`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      ok++;
      if (d.profileId) guardrailsProfileIds.add(d.profileId);
    } else {
      errors.push(`${code}: ${d.error || 'error'}`);
    }
  }
  btn.title = adminT('state_working');
  const deployRes = await apiFetch('/api/admin/netskope-policies/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      change_note: 'bulk add sample policies',
      guardrails_profile_ids: [...guardrailsProfileIds]
    })
  });
  if (!deployRes.ok) {
    let deployData = {};
    try { deployData = await deployRes.json(); } catch {}
    errors.push(`deploy: ${deployData.error || `HTTP ${deployRes.status}`}`);
  }
  btn.disabled = false;
  if (errors.length) {
    showAlert('Bulk policy errors', errors.join('\n'));
    btn.innerHTML = rowActionIcon('error');
    btn.title = `${adminT('state_error')} (${ok} ok, ${errors.length} errors)`;
  } else {
    btn.innerHTML = rowActionIcon('success');
    btn.title = `${adminT('state_updated')} (${ok})`;
  }
  btn.style.color = errors.length ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 6000);
}

async function deleteNetskopePoliciesForCodes(codes, onProgress = () => {}) {
  let ok = 0, errors = [];

  // Pass 1: delete rules for all participants (no deploy, no groups)
  for (const code of codes) {
    onProgress('rules', ok + errors.length, codes.length);
    try {
      const res = await apiFetch(`/api/admin/participants/${encodeURIComponent(code)}/netskope-policies?skip_deploy=true&skip_groups=true`, { method: 'DELETE' });
      const d = await res.json();
      const noTokenGroup = res.status === 400 && /no token group assigned/i.test(d.error || '');
      if (res.ok || noTokenGroup) { ok++; } else { errors.push(`${code}: ${d.error || 'error'}`); }
    } catch (e) {
      errors.push(`${code}: ${e.message}`);
    }
  }

  // Deploy once to apply all rule deletions
  onProgress('deploy', ok + errors.length, codes.length);
  const deployRes = await apiFetch('/api/admin/netskope-policies/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ change_note: 'bulk delete sample policies' }) });
  if (!deployRes.ok) {
    let deployData = {};
    try { deployData = await deployRes.json(); } catch {}
    errors.push(`deploy: ${deployData.error || `HTTP ${deployRes.status}`}`);
  }

  // Pass 2: delete groups + profiles for all participants
  let okG = 0;
  for (const code of codes) {
    onProgress('groups', okG, codes.length);
    try {
      const groupsRes = await apiFetch(`/api/admin/participants/${encodeURIComponent(code)}/netskope-groups`, { method: 'DELETE' });
      if (!groupsRes.ok) {
        let groupsData = {};
        try { groupsData = await groupsRes.json(); } catch {}
        errors.push(`${code}: ${groupsData.error || `HTTP ${groupsRes.status}`}`);
      }
    } catch (e) {
      errors.push(`${code}: ${e.message}`);
    }
    okG++;
  }
  return { ok, errors };
}

async function bulkDeleteNetskopePolicy(btn) {
  const rows = [...document.querySelectorAll('#codes-tbody tr')];
  const codes = rows.map(r => r.dataset.code).filter(Boolean);
  if (!codes.length) return;
  const orig = btn.innerHTML;
  const origTitle = btn.title;
  btn.disabled = true;
  btn.innerHTML = rowActionIcon('working');
  const { ok, errors } = await deleteNetskopePoliciesForCodes(codes, (_phase, done, total) => {
    btn.title = `${adminT('state_working')} (${done}/${total})`;
  });

  btn.disabled = false;
  if (errors.length) {
    showAlert('Bulk delete errors', errors.join('\n'));
    btn.innerHTML = rowActionIcon('error');
    btn.title = `${adminT('state_error')} (${ok} ok, ${errors.length} errors)`;
  } else {
    btn.innerHTML = rowActionIcon('success');
    btn.title = `${adminT('state_deleted')} (${ok})`;
  }
  btn.style.color = errors.length ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => { btn.innerHTML = orig; btn.title = origTitle; btn.style.color = ''; }, 6000);
}

async function resetPrompts(code) {
  await apiFetch(`/api/admin/codes/${code}/reset-prompts`, { method: 'POST' });
  loadAdminCodes();
}

async function resetAllAttempts() {
  showConfirm({ title: 'Reset point penalties', subtitle: 'All participants', body: 'This will clear all failed attempts (−5 pts each) for every participant. Completed challenges are kept. This cannot be undone.', okLabel: 'Reset penalties', onOk: async () => { await apiFetch('/api/admin/codes/reset-attempts', { method: 'POST' }); loadDashboard(); } });
}

async function resetAllChallenges(btn) {
  showConfirm({ title: 'Reset full CTF progress', subtitle: 'All participants', body: 'This will clear all challenge completions, penalties and hints for every participant. This cannot be undone.', okLabel: 'Reset all', onOk: () => runAllAction(btn, async () => { await apiFetch('/api/admin/codes/reset-challenges', { method: 'POST' }); await loadAdminCodes(); }) });
}

async function resetAllPrompts(btn) {
  showConfirm({ title: adminT('confirm_reset_counters_title'), subtitle: adminT('confirm_reset_counters_subtitle'), body: adminT('confirm_reset_counters_body'), okLabel: adminT('btn_reset'), onOk: () => runAllAction(btn, async () => { await apiFetch('/api/admin/codes/reset-prompts', { method: 'POST' }); await loadAdminCodes(); await loadDashboard(); }) });
}

async function deleteAllParticipants(btn) {
  showConfirm({
    title: adminT('confirm_delete_participants_title'),
    subtitle: adminT('confirm_delete_participants_subtitle'),
    body: adminT('confirm_delete_participants_body'),
    onOk: () => runAllAction(btn, async () => {
      const rows = [...document.querySelectorAll('#codes-tbody tr')];
      const codes = rows.map(r => r.dataset.code).filter(Boolean);
      if (codes.length) {
        const { errors } = await deleteNetskopePoliciesForCodes(codes);
        if (errors.length) {
          showAlert(adminT('participant_delete_cleanup_failed_title', { code: adminT('participants_title') }), errors.join('\n'));
          throw new Error('cleanup failed');
        }
      }
      const res = await apiFetch('/api/admin/codes', { method: 'DELETE' });
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        showAlert(adminT('state_error'), data.error || `HTTP ${res.status}`);
        throw new Error('delete failed');
      }
      await Promise.all([loadAdminCodes(), loadDashboard(), loadAvailableApiKeys()]);
    })
  });
}

/* ── Generic alert modal ── */
let alertModalOnClose = null;

function showAlert(title, body, onClose = null, type = 'warning') {
  document.getElementById('alert-modal-title').textContent = title;
  document.getElementById('alert-modal-body').innerHTML = body;
  alertModalOnClose = typeof onClose === 'function' ? onClose : null;
  const icon = document.getElementById('alert-modal-icon');
  if (type === 'success') {
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`;
    icon.style.background = 'rgba(34,197,94,0.15)';
  } else {
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    icon.style.background = 'rgba(245,158,11,0.15)';
  }
  document.getElementById('alert-modal').style.display = 'flex';
}
function closeAlertModal() {
  document.getElementById('alert-modal').style.display = 'none';
  const onClose = alertModalOnClose;
  alertModalOnClose = null;
  if (onClose) onClose();
}

/* ── Generic confirm modal ── */
function showConfirm({ title, subtitle = adminT('confirm_default_subtitle'), body, okLabel = adminT('btn_delete'), onOk }) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-subtitle').textContent = subtitle;
  document.getElementById('confirm-modal-body').textContent = body;
  const okBtn = document.getElementById('confirm-modal-ok');
  okBtn.textContent = okLabel;
  okBtn.onclick = () => { closeConfirmModal(); onOk(); };
  document.getElementById('confirm-modal').style.display = 'flex';
}
function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

function factoryReset() {
  const modal = document.getElementById('factory-reset-modal');
  const input = document.getElementById('factory-reset-input');
  const btn = document.getElementById('factory-reset-confirm-btn');
  input.value = '';
  btn.disabled = true;
  btn.style.opacity = '.4';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}

function closeFactoryResetModal() {
  document.getElementById('factory-reset-modal').style.display = 'none';
}

let factoryResetProgressShouldLogout = false;

function setFactoryResetProgressIcon(status) {
  const icon = document.getElementById('factory-reset-progress-icon');
  icon.className = `factory-reset-progress-icon is-${status}`;
  if (status === 'running') {
    icon.innerHTML = '<span class="factory-reset-spinner"></span>';
  } else if (status === 'success') {
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>';
  } else if (status === 'warning') {
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else {
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  }
}

function renderFactoryResetSteps(steps) {
  const container = document.getElementById('factory-reset-progress-steps');
  const iconByStatus = { success: '✓', warning: '!', error: '×' };
  container.innerHTML = (steps || []).map(step => {
    const status = ['success', 'warning', 'error', 'running'].includes(step.status) ? step.status : 'warning';
    const marker = iconByStatus[status] || '';
    return `
      <div class="factory-reset-step is-${status}">
        <span class="factory-reset-step-dot">${marker}</span>
        <div>
          <div class="factory-reset-step-title">${escapeHtml(step.label || adminT('factory_progress_step'))}</div>
          <div class="factory-reset-step-detail">${escapeHtml(step.details || '')}</div>
        </div>
      </div>
    `;
  }).join('');
}

function showFactoryResetProgressRunning() {
  factoryResetProgressShouldLogout = false;
  document.getElementById('factory-reset-progress-title').textContent = adminT('factory_progress_running_title');
  document.getElementById('factory-reset-progress-subtitle').textContent = adminT('factory_progress_running_subtitle');
  document.getElementById('factory-reset-progress-errors').style.display = 'none';
  const okBtn = document.getElementById('factory-reset-progress-ok');
  okBtn.disabled = true;
  setFactoryResetProgressIcon('running');
  renderFactoryResetSteps([
    { status: 'running', label: adminT('factory_progress_started'), details: adminT('factory_progress_started_detail') }
  ]);
  document.getElementById('factory-reset-progress-modal').style.display = 'flex';
}

function showFactoryResetProgressResult(data, shouldLogout) {
  const hasErrors = data.errors?.length || data.steps?.some(step => step.status === 'error');
  const hasWarnings = data.steps?.some(step => step.status === 'warning');
  const status = hasErrors ? 'error' : hasWarnings ? 'warning' : 'success';
  factoryResetProgressShouldLogout = shouldLogout;

  document.getElementById('factory-reset-progress-title').textContent = hasErrors
    ? adminT('factory_progress_issues')
    : hasWarnings
      ? adminT('factory_progress_warnings')
      : adminT('factory_progress_complete');
  document.getElementById('factory-reset-progress-subtitle').textContent = shouldLogout
    ? adminT('factory_progress_review_logout')
    : adminT('factory_progress_review');
  setFactoryResetProgressIcon(status);
  renderFactoryResetSteps(data.steps?.length ? data.steps : [
    { status, label: adminT('factory_progress_step'), details: data.error || adminT('factory_progress_no_report') }
  ]);

  const errorsEl = document.getElementById('factory-reset-progress-errors');
  if (data.errors?.length) {
    errorsEl.style.display = 'block';
    errorsEl.innerHTML = `<strong>${adminT('factory_progress_details')}:</strong><br>${data.errors.map(escapeHtml).join('<br>')}`;
  } else {
    errorsEl.style.display = 'none';
  }

  document.getElementById('factory-reset-progress-ok').disabled = false;
}

function closeFactoryResetProgressModal() {
  document.getElementById('factory-reset-progress-modal').style.display = 'none';
  if (factoryResetProgressShouldLogout) {
    factoryResetProgressShouldLogout = false;
    handleLogout();
  }
}

async function confirmFactoryReset() {
  const input = document.getElementById('factory-reset-input');
  if (input.value.trim().toUpperCase() !== 'RESET') return;

  closeFactoryResetModal();
  showFactoryResetProgressRunning();

  try {
    const res = await apiFetch('/api/admin/settings/factory-reset', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showFactoryResetProgressResult(data, true);
      return;
    }
    showFactoryResetProgressResult({
      error: data.error || adminT('factory_progress_failed_detail'),
      errors: [data.error || `HTTP ${res.status}`],
      steps: data.steps || [{ status: 'error', label: adminT('factory_progress_failed'), details: data.error || `HTTP ${res.status}` }],
    }, false);
  } catch (e) {
    showFactoryResetProgressResult({
      error: e.message,
      errors: [e.message],
      steps: [{ status: 'error', label: adminT('factory_progress_failed'), details: e.message }],
    }, false);
  }
}

async function saveMaxPrompts() {
  const val = parseInt(document.getElementById('admin-max-prompts').value, 10);
  if (!val || val < 1) return;
  const res = await apiFetch('/api/admin/settings/max-prompts', {
    method: 'PUT',
    body: JSON.stringify({ max_prompts: val })
  });
  const msg = document.getElementById('max-prompts-msg');
  if (res.ok) {
    _maxPrompts = val;
    msg.textContent = '✓ Saved!'; msg.style.color = 'var(--success)'; msg.style.display = 'inline';
    setTimeout(() => msg.style.display = 'none', 3000);
    loadAdminCodes();
  }
}

async function clearDatabase() {
  showConfirm({
    title: 'Clear Database',
    subtitle: 'This action cannot be undone',
    body: 'Will delete all participants, conversations, messages, challenges, prompt library entries, completions and point penalties. API keys, providers and settings are kept.',
    okLabel: 'Clear Database',
    onOk: async () => {
      const res = await apiFetch('/api/admin/settings/clear-database', { method: 'POST' });
      const msg = document.getElementById('clear-db-msg');
      if (res.ok) {
        msg.textContent = '✓ Database cleared';
        msg.style.color = 'var(--success)';
        msg.style.display = 'inline';
        setTimeout(() => { msg.style.display = 'none'; }, 4000);
        loadDashboard();
      }
    }
  });
}

async function generateDemoData() {
  const btn = document.getElementById('demo-data-btn');
  const msg = document.getElementById('demo-data-msg');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {
    const res = await apiFetch('/api/admin/demo-data', { method: 'POST' });
    const d = await res.json();
    if (d.ok) {
      const parts = [`✓ ${d.participants.length} participants`];
      if (d.challenges_created > 0) parts.push(`${d.challenges_created} challenges`);
      if (d.prompts_created > 0) parts.push(`${d.prompts_created} prompts`);
      if (d.conversations_created > 0) parts.push(`${d.conversations_created} conversations`);
      msg.textContent = parts.join(', ') + ' ready';
      msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 4000);
      loadDashboard();
    }
  } catch {}
  btn.disabled = false;
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> Generate demo data';
}

async function loadMaxPromptsSetting() {
  const res = await apiFetch('/api/admin/settings/max-prompts');
  const d = await res.json();
  const el = document.getElementById('admin-max-prompts');
  if (el) el.value = d.max_prompts || 100;
}

async function saveMaxRetries() {
  const val = parseInt(document.getElementById('admin-max-retries').value, 10);
  if (isNaN(val) || val < 0) return;
  const res = await apiFetch('/api/admin/settings/max-retries', {
    method: 'PUT',
    body: JSON.stringify({ max_retries: val })
  });
  const msg = document.getElementById('max-retries-msg');
  if (res.ok) {
    msg.textContent = '✓ Saved!'; msg.style.color = 'var(--success)'; msg.style.display = 'inline';
    setTimeout(() => msg.style.display = 'none', 3000);
  }
}

async function saveWorkshopLimits() {
  const msg = document.getElementById('workshop-limits-msg');
  const maxPrompts = parseInt(document.getElementById('admin-max-prompts').value, 10);
  const maxRetries = parseInt(document.getElementById('admin-max-retries').value, 10);
  if (!maxPrompts || maxPrompts < 1 || isNaN(maxRetries) || maxRetries < 0) {
    if (msg) {
      msg.textContent = 'Check the limit values';
      msg.style.color = 'var(--danger)';
    }
    return;
  }
  if (msg) {
    msg.textContent = 'Saving...';
    msg.style.color = 'var(--text-muted)';
  }
  try {
    const [promptsRes, retriesRes] = await Promise.all([
      apiFetch('/api/admin/settings/max-prompts', {
        method: 'PUT',
        body: JSON.stringify({ max_prompts: maxPrompts })
      }),
      apiFetch('/api/admin/settings/max-retries', {
        method: 'PUT',
        body: JSON.stringify({ max_retries: maxRetries })
      })
    ]);
    if (!promptsRes.ok || !retriesRes.ok) throw new Error('Failed to save limits');
    _maxPrompts = maxPrompts;
    loadAdminCodes();
    if (msg) {
      msg.textContent = '✓ Limits saved';
      msg.style.color = 'var(--success)';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    }
  } catch (e) {
    if (msg) {
      msg.textContent = e.message;
      msg.style.color = 'var(--danger)';
    }
  }
}

async function loadMaxRetriesSetting() {
  const res = await apiFetch('/api/admin/settings/max-retries');
  const d = await res.json();
  const el = document.getElementById('admin-max-retries');
  if (el) el.value = d.max_retries ?? 5;
}

let _availableApiKeys = [];

async function loadAvailableApiKeys() {
  // Kept for token assignment display elsewhere; no longer used for participant creation
  try {
    const res = await apiFetch('/api/admin/api-keys/available');
    _availableApiKeys = await res.json();
  } catch {}
}

// ── Registration Code (Admin > Capture the Flag) ──────────────────────────────

async function loadRegCode() {
  try {
    const res = await apiFetch('/api/admin/registration-code');
    const data = await res.json();
    const val = data.registration_code;
    const textEl = document.getElementById('reg-code-input-admin');
    const copyBtn = document.getElementById('reg-code-copy-btn');
    const editBtn = document.getElementById('reg-code-edit-btn');
    if (!textEl) return;
    textEl.textContent = val || '—';
    textEl.style.display = '';
    const editField = document.getElementById('reg-code-edit-field');
    if (editField) editField.style.display = 'none';
    if (copyBtn) copyBtn.disabled = !val;
    if (editBtn) {
      editBtn.innerHTML = rowActionIcon('edit');
      editBtn.className = 'row-icon-btn row-icon-btn--policy';
      editBtn.title = 'Edit';
      editBtn.onclick = () => toggleRegCodeEdit();
    }
  } catch {}
}

async function saveRegCode() {
  const editField = document.getElementById('reg-code-edit-field');
  if (!editField || editField.style.display === 'none') return;
  const val = editField.value.trim();
  if (!val) { loadRegCode(); return; }
  const res = await apiFetch('/api/admin/registration-code', {
    method: 'POST',
    body: JSON.stringify({ registration_code: val })
  });
  const d = await res.json();
  if (!res.ok) { showAlert('Error', d.error); loadRegCode(); return; }
  loadRegCode();
}

function toggleRegCodeEdit() {
  const textEl = document.getElementById('reg-code-input-admin');
  const editField = document.getElementById('reg-code-edit-field');
  const editBtn = document.getElementById('reg-code-edit-btn');
  if (!textEl || !editField || !editBtn) return;
  if (editField.style.display !== 'none') return;

  const currentVal = textEl.textContent.trim();
  textEl.style.display = 'none';
  editField.value = currentVal === '—' ? '' : currentVal;
  editField.style.display = '';
  editField.focus();
  editField.select();

  editBtn.innerHTML = rowActionIcon('save');
  editBtn.className = 'row-icon-btn row-icon-btn--policy';
  editBtn.title = 'Save';
  editBtn.onclick = () => saveRegCode();

  editField.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); saveRegCode(); }
    if (e.key === 'Escape') loadRegCode();
  };
}

function copyRegCode() {
  const textEl = document.getElementById('reg-code-input-admin');
  const val = textEl?.textContent?.trim();
  if (!val || val === '—') return;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.getElementById('reg-code-copy-btn');
    btn.title = 'Copied!';
    setTimeout(() => btn.title = 'Copy', 1500);
  });
}

async function cleanupParticipantPoliciesBeforeDelete(code) {
  let res;
  try {
    res = await apiFetch(`/api/admin/participants/${encodeURIComponent(code)}/netskope-policies`, { method: 'DELETE' });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (res.ok) return { ok: true };

  let data = {};
  try { data = await res.json(); } catch {}
  const error = data.error || `HTTP ${res.status}`;
  const noTokenGroup = res.status === 400 && /no token group assigned/i.test(error);
  if (noTokenGroup) return { ok: true, skipped: true };
  return { ok: false, error };
}

async function deleteCode(code) {
  showConfirm({
    title: adminT('confirm_delete_participant_title', { code }),
    subtitle: adminT('confirm_delete_participant_subtitle'),
    body: adminT('confirm_delete_participant_body'),
    onOk: async () => {
      const cleanup = await cleanupParticipantPoliciesBeforeDelete(code);
      if (!cleanup.ok) {
        showAlert(
          adminT('participant_delete_cleanup_failed_title', { code }),
          adminT('participant_delete_cleanup_failed_body', { error: cleanup.error })
        );
        return;
      }
      const res = await apiFetch(`/api/admin/codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        showAlert(adminT('state_error'), data.error || `HTTP ${res.status}`);
        return;
      }
      await Promise.all([loadAdminCodes(), loadAvailableApiKeys(), loadDashboard()]);
    }
  });
}

// ── Admins ──

async function loadAdmins() {
  const res = await apiFetch('/api/admin/admins');
  const admins = await res.json();
  const tbody = document.getElementById('admins-tbody');
  tbody.innerHTML = admins.length
    ? admins.map(a => {
        const disabled = (a.label || '').startsWith('[DISABLED]');
        const displayLabel = disabled ? a.label.replace('[DISABLED] ', '') : (a.label || '');
        const isDefault = a.code === 'ADMIN-2026';
        const b = 'border-right:2px solid var(--border);';
        return `<tr style="${disabled ? 'opacity:0.5;' : ''}">
          <td style="${b}">
            <code style="color:var(--accent);font-family:monospace;">${escapeHtml(a.code)}</code>
            ${isDefault ? '<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">(default)</span>' : ''}
          </td>
          <td style="${b}color:var(--text-secondary);">${escapeHtml(displayLabel)}</td>
          <td style="${b}text-align:center;">
            <span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${disabled ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)'};color:${disabled ? '#ef4444' : '#16a34a'};">${disabled ? 'Disabled' : 'Active'}</span>
          </td>
          <td style="text-align:center;${b}">
            <button class="row-icon-btn row-icon-btn--policy" title="View / copy API token" onclick="viewAdminToken('${escapeHtml(a.code)}', '${escapeHtml(a.api_key || '')}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </button>
          </td>
          <td style="text-align:center;${b}">
            <button class="row-icon-btn" title="Reset password" onclick="resetAdminPassword('${escapeHtml(a.code)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
          </td>
          <td style="text-align:center;${b}">
            ${!isDefault ? `<button class="row-icon-btn" title="${disabled ? 'Enable' : 'Disable'}" onclick="toggleAdminDisabled('${escapeHtml(a.code)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>${disabled ? '<line x1="8" y1="12" x2="16" y2="12"/>' : '<path d="M9 12l2 2 4-4"/>'}</svg>
            </button>` : ''}
          </td>
          <td style="text-align:center;">
            ${!isDefault ? `<button class="row-icon-btn row-icon-btn--danger" title="Delete" onclick="deleteAdmin('${escapeHtml(a.code)}')">
              ${rowActionIcon('delete-student')}
            </button>` : ''}
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No admins found</td></tr>`;
}

async function createAdmin() {
  const code = document.getElementById('new-admin-code').value.trim().toUpperCase();
  const label = document.getElementById('new-admin-label').value.trim();
  if (!code) return showAlert('Username required', 'Please enter a username for the new admin.');
  if (code.length < 5 || code.length > 12) return showAlert('Invalid username', 'Admin username must be between 5 and 12 characters.');

  const res = await apiFetch('/api/admin/codes', {
    method: 'POST',
    body: JSON.stringify({ code, role: 'admin', label })
  });
  const d = await res.json();
  if (res.ok) {
    document.getElementById('new-admin-code').value = '';
    document.getElementById('new-admin-label').value = '';
    showAlert('Admin created', `Username: <strong>${escapeHtml(code)}</strong><br>Password: <strong>${escapeHtml(d.password || '')}</strong><br><br>API Token:<br><code style="word-break:break-all;font-size:11px;">${escapeHtml(d.token || '')}</code>`);
    loadAdmins();
  } else {
    showAlert('Error creating admin', d.error || 'Unknown error');
  }
}

async function deleteAdmin(code) {
  showConfirm({ title: `Delete ${code}`, subtitle: 'Admin account', body: 'This admin account will be permanently deleted.', onOk: async () => {
    const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok) { showAlert('Cannot delete admin', d.error || 'Error'); return; }
    loadAdmins();
  }});
}

async function deleteAllAdmins() {
  showConfirm({
    title: 'Delete all admins',
    subtitle: 'All admin accounts except ADMIN-2026',
    body: 'All admin accounts except ADMIN-2026 will be permanently deleted. This cannot be undone.',
    okLabel: 'Delete all',
    onOk: async () => {
      const r = await apiFetch('/api/admin/admins/all', { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); showAlert('Error', d.error || 'Error'); return; }
      loadAdmins();
    }
  });
}

async function disableAllAdmins() {
  showConfirm({
    title: 'Disable all admins',
    subtitle: 'All admin accounts except ADMIN-2026',
    body: 'All admin accounts except ADMIN-2026 will be disabled. They will not be able to log in until re-enabled.',
    okLabel: 'Disable all',
    onOk: async () => {
      const res = await apiFetch('/api/admin/admins');
      const admins = await res.json();
      const others = admins.filter(a => a.code !== 'ADMIN-2026' && !(a.label || '').startsWith('[DISABLED]'));
      await Promise.all(others.map(a => apiFetch(`/api/admin/admins/${encodeURIComponent(a.code)}/disable`, { method: 'PATCH' })));
      loadAdmins();
    }
  });
}

async function toggleAdminDisabled(code) {
  const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}/disable`, { method: 'PATCH' });
  const d = await r.json();
  if (!r.ok) { showAlert('Error', d.error || 'Error'); return; }
  loadAdmins();
}

async function resetAdminPassword(code) {
  showConfirm({ title: `Reset password for ${code}`, subtitle: 'Admin account', body: 'A new random password will be generated.', onOk: async () => {
    const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}/reset-password`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { showAlert('Error', d.error || 'Error'); return; }
    showAlert('Password reset', `New password for <strong>${escapeHtml(code)}</strong>:<br><br><code style="font-size:14px;letter-spacing:2px;">${escapeHtml(d.password)}</code><br><br>Share this with the admin user.`);
  }});
}

function viewAdminToken(code, currentToken) {
  if (currentToken) navigator.clipboard?.writeText(currentToken).catch(() => {});
  showAlert('API Token — ' + escapeHtml(code),
    (currentToken
      ? `<code style="word-break:break-all;font-size:11px;display:block;margin-bottom:12px;padding:8px;background:var(--bg-primary);border-radius:6px;">${escapeHtml(currentToken)}</code>${currentToken ? '<p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;">Copied to clipboard.</p>' : ''}`
      : '<p style="color:var(--text-muted);font-size:12px;margin-bottom:12px;">No token set.</p>') +
    `<button class="btn-secondary" style="font-size:12px;padding:6px 14px;" onclick="regenerateAdminToken('${escapeHtml(code)}')">Regenerate token</button>`
  );
}

async function regenerateAdminToken(code) {
  closeAlertModal();
  showConfirm({ title: `Regenerate token for ${code}`, subtitle: 'Admin account', body: 'The old token will stop working immediately.', okLabel: 'Regenerate', onOk: async () => {
    const r = await apiFetch(`/api/admin/admins/${encodeURIComponent(code)}/regenerate-token`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { showAlert('Error', d.error || 'Error'); return; }
    navigator.clipboard?.writeText(d.token).catch(() => {});
    showAlert('Token regenerated', `New API token for <strong>${escapeHtml(code)}</strong>:<br><br><code style="word-break:break-all;font-size:11px;display:block;padding:8px;background:var(--bg-primary);border-radius:6px;">${escapeHtml(d.token)}</code><br><p style="font-size:11px;color:var(--text-muted);margin:0;">Copied to clipboard.</p>`);
    loadAdmins();
  }});
}

// ── Prompt Library ──

let _promptLibrary = [];

function ensurePromptRows() {
  if (document.querySelectorAll('.prompt-row').length === 0) addPromptRow();
}

function toggleNewPromptRow() {
  const tbody = document.getElementById('new-prompt-tbody');
  if (!tbody) return;
  if (tbody.innerHTML.trim()) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = `
    <tr class="challenge-admin-row challenge-group-start">
      <td rowspan="2" style="border:none;"></td>
      <td class="challenge-id-cell" rowspan="2" style="text-align:center;vertical-align:middle;color:var(--text-muted);font-size:12px;font-weight:600;">NEW</td>
      <td style="padding:10px 12px;"><textarea class="adm-inline-input" id="new-prompt-text" placeholder="Write a prompt..." rows="2" style="width:100%;resize:none;overflow:hidden;" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea></td>
      <td rowspan="2"></td>
      <td rowspan="2"></td>
      <td rowspan="2"></td>
    </tr>
    <tr class="challenge-admin-row challenge-group-end">
      <td style="padding:6px 12px;text-align:right;border-top:1px solid var(--border);">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-secondary" onclick="toggleNewPromptRow()" style="padding:6px 0;font-size:12px;width:80px;">Cancel</button>
          <button class="btn-primary" onclick="createPromptInline()" style="padding:6px 0;font-size:12px;width:80px;">Create</button>
        </div>
      </td>
    </tr>`;
  document.getElementById('new-prompt-text')?.focus();
}

async function createPromptInline() {
  const text = document.getElementById('new-prompt-text')?.value.trim();
  if (!text) return;
  const res = await apiFetch('/api/admin/prompt-library', {
    method: 'POST',
    body: JSON.stringify({ prompts: [text] })
  });
  if (res.ok) {
    const tbody = document.getElementById('new-prompt-tbody');
    if (tbody) tbody.innerHTML = '';
    loadPromptLibrary();
  } else {
    const d = await res.json();
    alert(d.error);
  }
}

function addPromptRow() {
  const container = document.getElementById('prompt-rows');
  const row = document.createElement('div');
  row.className = 'prompt-row';
  row.innerHTML = `
    <textarea class="prompt-row-text" placeholder="Write a prompt..." rows="1" style="flex:1;min-width:0;background:var(--input-bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;color:var(--text-primary);font-size:13px;font-family:inherit;line-height:1.45;resize:vertical;min-height:36px;max-height:300px;"></textarea>
    <div class="prompt-row-actions"></div>
  `;
  container.appendChild(row);
  renderPromptRowActions();
}

function removePromptRow(btn) {
  btn.closest('.prompt-row')?.remove();
  renderPromptRowActions();
}

function renderPromptRowActions() {
  const rows = [...document.querySelectorAll('#prompt-rows > .prompt-row')];
  rows.forEach((row, idx) => {
    const actions = row.querySelector('.prompt-row-actions');
    actions.innerHTML = idx > 0
      ? `<button class="row-icon-btn row-icon-btn--danger" onclick="removePromptRow(this)" title="Remove prompt row" aria-label="Remove prompt row">${rowActionIcon('delete-student')}</button>`
      : '';
  });
}

async function loadPromptLibrary() {
  const res = await apiFetch('/api/admin/prompt-library');
  if (!res.ok) return;
  const prompts = await res.json();
  _promptLibrary = prompts;
  updatePromptToggleAllButton();

  const tbody = document.getElementById('prompts-tbody');
  if (!prompts.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">${adminT('state_no_prompts')}</td></tr>`;
    return;
  }

  tbody.innerHTML = prompts.map((p, idx) => {
    const isVisible = promptIsVisible(p.visible);
    return `
    <tr id="prompt-row-${p.id}" draggable="true" data-id="${p.id}" style="cursor:grab;">
      <td style="text-align:center;color:var(--text-muted);">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.4;pointer-events:none;display:block;margin:auto;"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
      </td>
      <td class="prompt-id-cell" style="text-align:center;border-right:2px solid var(--border);"><code id="prompt-seq-${p.id}">#${idx + 1}</code></td>
      <td class="prompt-table-text-cell" id="prompt-text-${p.id}" style="border-right:2px solid var(--border);">${escapeHtml(p.text)}</td>
      <td style="text-align:center;">
        <button class="row-icon-btn row-icon-btn--policy" onclick="editPromptInline(${p.id})" id="prompt-edit-btn-${p.id}" title="${adminT('btn_edit')}" aria-label="${adminT('btn_edit')}">
          ${rowActionIcon('edit')}
        </button>
      </td>
      <td style="text-align:center;">
        <button class="row-icon-btn row-icon-btn--danger" onclick="deletePrompt(${p.id})" id="prompt-del-btn-${p.id}" title="${adminT('btn_delete')}" aria-label="${adminT('btn_delete')}">
          ${rowActionIcon('delete-student')}
        </button>
      </td>
      <td style="text-align:center;">
        <button class="row-icon-btn ${isVisible ? 'row-icon-btn--policy' : ''}" onclick="togglePromptVisible(${p.id}, ${isVisible ? 0 : 1}, this)" id="prompt-vis-btn-${p.id}" title="${isVisible ? adminT('prompt_visible_on') : adminT('prompt_visible_off')}" aria-label="${isVisible ? adminT('prompt_visible_on') : adminT('prompt_visible_off')}">
          ${rowActionIcon(isVisible ? 'visible' : 'hidden')}
        </button>
      </td>
    </tr>
  `;
  }).join('');

  initPromptDragDrop(tbody);
}

function promptIsVisible(value) {
  return !(value === 0 || value === false || value === '0' || value === 'false');
}

function initPromptDragDrop(tbody) {
  let dragSrc = null;

  tbody.querySelectorAll('tr[draggable]').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = row;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.style.opacity = '0.4', 0);
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      tbody.querySelectorAll('tr').forEach(r => r.style.borderTop = '');
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tbody.querySelectorAll('tr').forEach(r => r.style.borderTop = '');
      if (row !== dragSrc) row.style.borderTop = '2px solid var(--accent)';
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const rows = [...tbody.querySelectorAll('tr[data-id]')];
      const fromIdx = rows.indexOf(dragSrc);
      const toIdx = rows.indexOf(row);
      rows.splice(fromIdx, 1);
      rows.splice(toIdx, 0, dragSrc);
      rows.forEach(r => tbody.appendChild(r));
      tbody.querySelectorAll('tr').forEach(r => r.style.borderTop = '');
      rows.forEach((r, i) => { const el = document.getElementById(`prompt-seq-${r.dataset.id}`); if (el) el.textContent = `#${i + 1}`; });
      const ids = rows.map(r => parseInt(r.dataset.id));
      await apiFetch('/api/admin/prompt-library/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    });
  });
}

function updatePromptToggleAllButton() {
  const btn = document.getElementById('prompt-toggle-all-btn');
  if (!btn) return;
  const prompts = Array.isArray(_promptLibrary) ? _promptLibrary : [];
  const allVisible = prompts.length > 0 && prompts.every(p => promptIsVisible(p.visible));
  const nextAction = allVisible ? 'hidden' : 'visible';
  const title = allVisible ? adminT('prompt_hide_all') : adminT('prompt_show_all');
  btn.disabled = prompts.length === 0;
  btn.classList.toggle('row-icon-btn--policy', !allVisible && prompts.length > 0);
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = rowActionIcon(nextAction);
}

function editPromptInline(id) {
  const textEl = document.getElementById(`prompt-text-${id}`);
  const editBtn = document.getElementById(`prompt-edit-btn-${id}`);
  if (!textEl || textEl.querySelector('textarea')) return;

  const original = textEl.textContent;
  textEl.innerHTML = `<textarea class="prompt-inline-editor" rows="3">${escapeHtml(original)}</textarea>`;
  const ta = textEl.querySelector('textarea');
  ta.style.height = ta.scrollHeight + 'px';
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  editBtn.innerHTML = rowActionIcon('save');
  editBtn.className = 'row-icon-btn row-icon-btn--policy';
  editBtn.style.cssText = '';
  editBtn.title = adminT('btn_save');
  editBtn.setAttribute('aria-label', adminT('btn_save'));
  editBtn.onclick = () => savePromptInline(id, ta, original);

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') cancelPromptInline(id, textEl, editBtn, original);
  });
}

async function savePromptInline(id, ta, original) {
  const newText = ta.value.trim();
  if (!newText) return;
  if (newText === original) { cancelPromptInline(id, ta.closest('.prompt-table-text-cell'), document.getElementById(`prompt-edit-btn-${id}`), original); return; }
  try {
    const res = await apiFetch(`/api/admin/prompt-library/${id}`, { method: 'PUT', body: JSON.stringify({ text: newText }) });
    if (!res.ok) throw new Error(await res.text());
    loadPromptLibrary();
  } catch (e) { alert('Error saving prompt: ' + e.message); }
}

async function togglePromptVisible(id, visible, btn = null) {
  const nextVisible = visible ? 1 : 0;
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = rowActionIcon('working');
    }
    const res = await apiFetch(`/api/admin/prompt-library/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ visible: nextVisible })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const prompt = _promptLibrary.find(p => Number(p.id) === Number(id));
    if (prompt) prompt.visible = nextVisible;
    if (btn) {
      const isVisible = nextVisible === 1;
      btn.disabled = false;
      btn.classList.toggle('row-icon-btn--policy', isVisible);
      btn.title = isVisible ? adminT('prompt_visible_on') : adminT('prompt_visible_off');
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('onclick', `togglePromptVisible(${id}, ${isVisible ? 0 : 1}, this)`);
      btn.innerHTML = rowActionIcon(isVisible ? 'visible' : 'hidden');
    }
    updatePromptToggleAllButton();
  } catch (e) {
    if (btn) {
      const prompt = _promptLibrary.find(p => Number(p.id) === Number(id));
      const isVisible = promptIsVisible(prompt?.visible);
      btn.disabled = false;
      btn.innerHTML = rowActionIcon(isVisible ? 'visible' : 'hidden');
    }
    showAlert(adminT('state_error'), e.message);
  }
}

async function toggleAllPromptsVisible() {
  const prompts = Array.isArray(_promptLibrary) ? _promptLibrary : [];
  if (!prompts.length) return;
  const allVisible = prompts.every(p => promptIsVisible(p.visible));
  const nextVisible = allVisible ? 0 : 1;
  const btn = document.getElementById('prompt-toggle-all-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = rowActionIcon('working');
  }
  try {
    await Promise.all(prompts.map(p => apiFetch(`/api/admin/prompt-library/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({ visible: nextVisible })
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })));
    prompts.forEach(p => { p.visible = nextVisible; });
    loadPromptLibrary();
  } catch (e) {
    showAlert(adminT('state_error'), e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      updatePromptToggleAllButton();
    }
  }
}


function cancelPromptInline(id, textEl, editBtn, original) {
  textEl.textContent = original;
  editBtn.innerHTML = rowActionIcon('edit');
  editBtn.className = 'row-icon-btn row-icon-btn--policy';
  editBtn.style.cssText = '';
  editBtn.title = adminT('btn_edit');
  editBtn.setAttribute('aria-label', adminT('btn_edit'));
  editBtn.onclick = () => editPromptInline(id);
}

async function createPrompts() {
  const prompts = [...document.querySelectorAll('#prompt-rows textarea, #prompt-rows input, #prompt-rows [contenteditable="true"]')]
    .map(el => (el.value ?? el.textContent ?? '').trim())
    .filter(Boolean);

  if (!prompts.length) return alert('Add at least one prompt');

  const res = await apiFetch('/api/admin/prompt-library', {
    method: 'POST',
    body: JSON.stringify({ prompts })
  });
  if (res.ok) {
    document.getElementById('prompt-rows').innerHTML = '';
    addPromptRow();
    loadPromptLibrary();
  } else {
    const d = await res.json();
    alert(d.error);
  }
}

async function deletePrompt(id) {
  showConfirm({ title: adminT('confirm_delete_prompt_title'), body: adminT('confirm_delete_prompt_body'), onOk: async () => { await apiFetch(`/api/admin/prompt-library/${id}`, { method: 'DELETE' }); loadPromptLibrary(); } }); return;
  await apiFetch(`/api/admin/prompt-library/${id}`, { method: 'DELETE' });
  loadPromptLibrary();
}

async function deleteAllPrompts() {
  showConfirm({ title: adminT('confirm_delete_all_prompts_title'), body: adminT('confirm_delete_all_prompts_body'), onOk: async () => { await apiFetch('/api/admin/prompt-library', { method: 'DELETE' }); loadPromptLibrary(); } }); return;
  await apiFetch('/api/admin/prompt-library', { method: 'DELETE' });
  loadPromptLibrary();
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportPromptCsv() {
  const rows = [['seq', 'text', 'visible'], ..._promptLibrary.map((p, i) => [i + 1, p.text, Number(p.visible) === 1 ? 1 : 0])];
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prompt-library.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

async function importPromptCsv(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) return showAlert('Import error', 'CSV is empty.');

    const first = rows[0].map(v => v.trim().toLowerCase());
    const hasHeader = first.includes('text') || first.includes('prompt');
    const textIndex = hasHeader
      ? Math.max(first.indexOf('text'), first.indexOf('prompt'))
      : 0;
    const visibleIndex = hasHeader ? first.indexOf('visible') : -1;

    const prompts = rows
      .slice(hasHeader ? 1 : 0)
      .map(row => ({
        text: (row[textIndex] || '').trim(),
        visible: visibleIndex >= 0 ? parsePromptVisibleCsvValue(row[visibleIndex]) : 1
      }))
      .filter(p => p.text);

    if (!prompts.length) return showAlert('Import error', 'No prompts found in CSV. Make sure the file has a "text" or "prompt" column header, or plain text in the first column.');

    const res = await apiFetch('/api/admin/prompt-library/import', {
      method: 'POST',
      body: JSON.stringify({ prompts })
    });
    const d = await res.json();
    if (res.ok) {
      showAlert('Import complete', `Imported ${d.imported} prompt${d.imported === 1 ? '' : 's'}.`);
      loadPromptLibrary();
    } else {
      showAlert('Import error', d.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    showAlert('Import error', err.message);
  } finally {
    input.value = '';
  }
}

function parsePromptVisibleCsvValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 1;
  return ['1', 'true', 'yes', 'y', 'visible', 'on'].includes(normalized) ? 1 : 0;
}

// ── Netskope Tokens ──

async function loadApiKeys() {
  const res = await apiFetch('/api/admin/api-keys');
  const allKeys = await res.json();
  const keys = allKeys.filter(k => k.assigned_to);
  const tbody = document.getElementById('apikeys-tbody');
  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">${adminT('state_no_tokens')}</td></tr>`;
    return;
  }
  tbody.innerHTML = keys.map(k => {
    const hasValue = k.key != null && k.key !== '';
    const isAssigned = !!k.assigned_to;
    const statusBadge = isAssigned
      ? `<span class="badge badge-participant">assigned</span>`
      : hasValue
        ? `<span class="badge" style="background:rgba(34,197,94,0.15);color:var(--success);">available</span>`
        : `<span class="badge" style="background:rgba(251,191,36,0.15);color:var(--warning);">no value</span>`;

    const valueCell = hasValue
      ? `<div style="display:flex;gap:6px;align-items:center;">
           <code style="font-family:monospace;font-size:11px;color:var(--text-muted)">${truncate(k.key, 24)}</code>
           <button onclick="copyToClipboard(this)" data-value="${escapeHtml(k.key)}" title="Copy full token" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--text-muted);display:flex;align-items:center;" onmouseenter="this.style.color='var(--accent)'" onmouseleave="this.style.color='var(--text-muted)'">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
           </button>
         </div>`
      : `<div class="admin-inline-action">
           <input type="text" placeholder="paste token value" id="tv-${k.id}"
             style="background:var(--input-bg);border:1px solid var(--border);border-radius:4px;padding:2px 6px;color:var(--text-primary);font-size:11px;font-family:monospace;width:140px;height:28px;" />
           <button class="row-icon-btn row-icon-btn--policy" onclick="setTokenValue(${k.id})" title="${adminT('btn_save')}" aria-label="${adminT('btn_save')}">${rowActionIcon('save')}</button>
         </div>`;

    return `<tr>
      <td style="font-size:12px;">${escapeHtml(k.netskope_token_group_name || '—')}</td>
      <td style="font-size:12px;">${escapeHtml(k.netskope_token_name || k.label || '—')}</td>
      <td>${valueCell}</td>
      <td>${statusBadge}</td>
      <td>${isAssigned ? `<code style="color:var(--accent);font-size:12px;">${k.assigned_to}</code>` : '—'}</td>
      <td style="color:var(--text-muted);font-size:12px;">${k.netskope_expire_time ? new Date(k.netskope_expire_time).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '—'}</td>
    </tr>`;
  }).join('');
}

function copyToClipboard(btn) {
  const text = btn.getAttribute('data-value');
  navigator.clipboard.writeText(text).then(() => {
    const svg = btn.querySelector('svg');
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.style.color = 'var(--success)';
    setTimeout(() => {
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      btn.style.color = 'var(--text-muted)';
    }, 1500);
  });
}

async function setTokenValue(id) {
  const input = document.getElementById(`tv-${id}`);
  const value = input?.value.trim();
  if (!value) return;
  const res = await apiFetch(`/api/admin/api-keys/${id}/value`, {
    method: 'PATCH',
    body: JSON.stringify({ value })
  });
  if (res.ok) { loadApiKeys(); loadAvailableApiKeys(); }
  else { const d = await res.json(); alert(d.error); }
}

function deleteUnassignedTokens() {
  showConfirm({
    title: 'Delete all unassigned tokens',
    subtitle: 'This cannot be undone',
    body: 'All tokens that are not assigned to any participant will be permanently deleted from both this portal and Netskope.',
    okLabel: 'Delete unassigned',
    onOk: async () => {
      const res = await apiFetch('/api/admin/api-keys/unassigned', { method: 'DELETE' });
      const d = await res.json();
      const banner = document.getElementById('sync-banner');
      banner.style.display = 'block';
      banner.style.background = d.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)';
      banner.style.color = d.ok ? 'var(--success)' : 'var(--danger)';
      banner.textContent = d.ok ? `Deleted ${d.deleted} unassigned token(s).` : (d.error || 'Error deleting tokens.');
      loadApiKeys();
    }
  });
}

async function deleteApiKey(id) {
  showConfirm({ title: 'Delete token', subtitle: 'Removes from portal and Netskope', body: 'The token and its token group will be permanently deleted from both this portal and Netskope.', onOk: async () => { const res = await apiFetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' }); const d = await res.json(); const banner = document.getElementById('sync-banner'); banner.style.display = 'block'; banner.style.background = d.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)'; banner.style.color = d.ok ? 'var(--success)' : 'var(--danger)'; banner.textContent = d.ok ? 'Token deleted.' : (d.error || 'Error deleting token.'); loadApiKeys(); } }); return;
  const res = await apiFetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
  const d = await res.json();
  if (res.ok) {
    if (d.netskope_errors?.length) {
      alert(`Deleted locally, but Netskope returned errors:\n${d.netskope_errors.join('\n')}`);
    }
    loadApiKeys();
    loadAvailableApiKeys();
  } else {
    alert(d.error);
  }
}

async function netskopeSync() {
  const btn = document.getElementById('btn-sync');
  const label = document.getElementById('sync-label');
  const banner = document.getElementById('sync-banner');
  btn.disabled = true;
  label.textContent = 'Syncing...';

  try {
    const res = await apiFetch('/api/admin/netskope/sync', { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      banner.style.display = 'block';
      banner.style.background = 'rgba(34,197,94,0.1)';
      banner.style.border = '1px solid rgba(34,197,94,0.3)';
      banner.style.color = 'var(--success)';
      banner.textContent = `✓ Sync complete: ${d.imported} new token${d.imported !== 1 ? 's' : ''} imported, ${d.skipped} already present. Tokens synced from Netskope have no value — set it manually or create new tokens from this portal.`;
      loadApiKeys();
      loadAvailableApiKeys();
    } else {
      showSyncError(banner, d.error);
    }
  } catch (e) {
    showSyncError(banner, e.message);
  } finally {
    btn.disabled = false;
    label.textContent = 'Sync from Netskope';
    setTimeout(() => banner.style.display = 'none', 8000);
  }
}

function showSyncError(banner, msg) {
  banner.style.display = 'block';
  banner.style.background = 'rgba(239,68,68,0.1)';
  banner.style.border = '1px solid rgba(239,68,68,0.3)';
  banner.style.color = 'var(--danger)';
  banner.textContent = `✗ Error: ${msg}`;
}

function updateNsNamePreview() {
  const groupPrefix = document.getElementById('ns-bulk-prefix-group')?.value || 'Participant-Group-';
  const tokenPrefix = document.getElementById('ns-bulk-prefix-token')?.value || 'Participant-Token-';
  const start = parseInt(document.getElementById('ns-bulk-start')?.value, 10) || 1;
  const elG = document.getElementById('ns-name-preview-group');
  const elT = document.getElementById('ns-name-preview-token');
  if (elG) elG.textContent = `${groupPrefix}${start}`;
  if (elT) elT.textContent = `${tokenPrefix}${start}`;
}

async function netskopeCreateBulk() {
  const count = parseInt(document.getElementById('ns-bulk-count').value, 10);
  const expireValue = parseInt(document.getElementById('ns-expire-value').value, 10);
  const expireUnit = document.getElementById('ns-expire-unit').value;
  const groupPrefix = (document.getElementById('ns-bulk-prefix-group')?.value || 'Participant-Group-').trim();
  const tokenPrefix = (document.getElementById('ns-bulk-prefix-token')?.value || 'Participant-Token-').trim();
  const prefix = groupPrefix; // kept for duplicate check (groups are what we check)
  const startNumber = parseInt(document.getElementById('ns-bulk-start')?.value, 10) || 1;

  const resultEl = document.getElementById('ns-create-result');
  const btn = document.getElementById('btn-bulk-create');

  resultEl.style.display = 'block';
  resultEl.style.background = 'var(--bg-tertiary)';
  resultEl.style.border = '1px solid var(--border)';
  resultEl.style.color = 'var(--text-muted)';
  resultEl.textContent = `Checking for duplicates and creating ${count} token${count > 1 ? 's' : ''} in Netskope… this may take a moment.`;
  btn.disabled = true;

  const expireIn = expireValue ? { value: expireValue, unit: expireUnit } : null;

  try {
    const res = await apiFetch('/api/admin/netskope/create-bulk', {
      method: 'POST',
      body: JSON.stringify({ count, expire_in: expireIn, group_prefix: groupPrefix, token_prefix: tokenPrefix, start_number: startNumber })
    });
    const d = await res.json();

    if (res.status === 409 && d.duplicates) {
      resultEl.style.background = 'rgba(251,191,36,0.1)';
      resultEl.style.border = '1px solid rgba(251,191,36,0.3)';
      resultEl.style.color = 'var(--warning)';
      resultEl.textContent = `⚠️ Already exist in Netskope: ${d.duplicates.join(', ')}. Nothing was created.`;
    } else if (res.ok) {
      const errCount = d.errors || 0;
      resultEl.style.background = errCount > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)';
      resultEl.style.border = errCount > 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(34,197,94,0.3)';
      resultEl.style.color = errCount > 0 ? 'var(--warning)' : 'var(--success)';

      const lines = [`✓ ${d.saved} token${d.saved !== 1 ? 's' : ''} created and saved.`];
      if (errCount > 0) lines.push(`⚠️ ${errCount} failed.`);

      const names = d.results.filter(r => !r.error).map(r => r.group_name).join(', ');
      if (names) lines.push(`Groups: ${names}`);

      resultEl.textContent = lines.join(' ');
      loadApiKeys();
      loadAvailableApiKeys();
    } else {
      resultEl.style.background = 'rgba(239,68,68,0.1)';
      resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
      resultEl.style.color = 'var(--danger)';
      resultEl.textContent = `✗ Error: ${d.error}`;
    }
  } catch (e) {
    resultEl.style.background = 'rgba(239,68,68,0.1)';
    resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
    resultEl.style.color = 'var(--danger)';
    resultEl.textContent = `✗ Error: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ── Settings: Netskope ──

async function loadNetskopeSettings() {
  try {
    const res = await apiFetch('/api/admin/settings/netskope');
    const d = await res.json();
    const tenantEl = document.getElementById('ns-tenant');
    if (tenantEl) tenantEl.value = d.tenant || '';
    const tokenEl = document.getElementById('ns-api-token');
    if (tokenEl) tokenEl.value = d.api_token || '';
  } catch {}
}

async function saveNetskopeSettings() {
  const tenant = document.getElementById('ns-tenant').value.trim();
  const apiToken = document.getElementById('ns-api-token').value.trim();
  const tokenIsPlaceholder = apiToken.startsWith('••••');
  if (!tenant || (!apiToken && !tokenIsPlaceholder)) return showNsMsg('Both tenant and API token are required', false);
  if (!tenant) return showNsMsg('Tenant is required', false);

  const res = await apiFetch('/api/admin/settings/netskope', {
    method: 'PUT',
    body: JSON.stringify({ tenant, api_token: apiToken })
  });
  if (res.ok) {
    await loadNetskopeSettings();
    showNsMsg('✓ Saved!', true);
  } else {
    const d = await res.json();
    showNsMsg(`✗ ${d.error}`, false);
  }
}

async function testGatewayUrl() {
  const msgEl = document.getElementById('gateway-test-msg');
  msgEl.textContent = 'Testing...';
  msgEl.style.color = 'var(--text-muted)';
  msgEl.style.display = 'inline';
  try {
    const res = await apiFetch('/api/admin/settings/test-gateway');
    const d = await res.json();
    if (d.ok) {
      msgEl.textContent = `✓ Reachable (${d.status} ${d.statusText})`;
      msgEl.style.color = 'var(--success)';
    } else {
      msgEl.textContent = `✗ ${d.error}`;
      msgEl.style.color = 'var(--danger)';
    }
  } catch (e) {
    msgEl.textContent = `✗ ${e.message}`;
    msgEl.style.color = 'var(--danger)';
  }
  setTimeout(() => { msgEl.style.display = 'none'; }, 5000);
}

async function testNetskopeConnection() {
  showNsMsg('Testing...', null);
  try {
    const res = await apiFetch('/api/admin/netskope/sync-preview');
    const d = await res.json();
    if (res.ok) {
      showNsMsg(`✓ Connected! Found ${d.groups.length} token group${d.groups.length !== 1 ? 's' : ''} and ${d.tokens.length} token${d.tokens.length !== 1 ? 's' : ''}.`, true);
    } else {
      showNsMsg(`✗ ${d.error}`, false);
    }
  } catch (e) {
    showNsMsg(`✗ ${e.message}`, false);
  }
}

function showNsMsg(text, success) {
  const el = document.getElementById('ns-save-msg');
  el.textContent = text;
  el.style.color = success === true ? 'var(--success)' : success === false ? 'var(--danger)' : 'var(--text-muted)';
  el.style.display = 'inline';
  if (success !== null) setTimeout(() => el.style.display = 'none', 4000);
}

async function loadAiGatewayMonitor() {
  const body = document.getElementById('aigw-monitor-body');
  const btn = document.getElementById('aigw-monitor-refresh');
  if (!body) return;
  stopAiGatewaySyncCountdowns();
  body.innerHTML = '<div class="aigateway-monitor-empty">Loading AI Gateway status...</div>';
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch('/api/admin/netskope/appliances');
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      const looksLikeHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
      throw new Error(looksLikeHtml
        ? 'AI Gateway status endpoint returned HTML. Restart the portal server so the new /api/admin/netskope/appliances route is loaded.'
        : 'AI Gateway status endpoint returned invalid JSON.');
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderAiGatewayMonitor(data);
  } catch (e) {
    body.innerHTML = `<div class="aigateway-monitor-empty aigateway-monitor-empty--error">${escapeHtml(e.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderAiGatewayMonitor(data) {
  const body = document.getElementById('aigw-monitor-body');
  if (!body) return;
  const appliances = Array.isArray(data.elements) ? data.elements : [];
  if (!appliances.length) {
    stopAiGatewaySyncCountdowns();
    const host = data.configured_gateway_host ? ` for host ${escapeHtml(data.configured_gateway_host)}` : '';
    body.innerHTML = `<div class="aigateway-monitor-empty">No AI Gateway appliance found${host}.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="aigateway-monitor-grid">
      ${appliances.map(renderAiGatewayAppliance).join('')}
    </div>
    <div class="aigateway-monitor-footer">
      Tenant: ${escapeHtml(data.tenant || '-')} - Last refresh: ${escapeHtml(formatAiGatewayDate(data.fetched_at))}
    </div>
  `;
  startAiGatewaySyncCountdowns();
}

function renderAiGatewayAppliance(a) {
  const status = String(a.status || 'unknown').toLowerCase();
  const cpu = clampPercent(a.cpu_used);
  const memory = clampPercent(a.memory_used);
  const cpuAvg = Array.isArray(a.cpu_avg) ? a.cpu_avg.map(n => Number(n).toFixed(2)) : [];
  const reachability = Array.isArray(a.reachability) ? a.reachability : [];

  return `
    <article class="aigateway-appliance">
      <div class="aigateway-appliance-head">
        <div>
          <h3>${escapeHtml(a.name || 'AI Gateway')}</h3>
          <p>${escapeHtml(a.host || '-')}</p>
        </div>
        <span class="aigateway-status aigateway-status--${status === 'connected' ? 'connected' : 'warning'}">${escapeHtml(status)}</span>
      </div>

      <div class="aigateway-appliance-layout">
        <div class="aigateway-column">
          ${renderAiGatewayUsageWidget('CPU used', cpu, renderAiGatewayLoadAverage(cpuAvg), 'cpu')}
        </div>

        <div class="aigateway-column">
          ${renderAiGatewayUsageWidget('Memory used', memory, renderAiGatewayCurrentUsage(memory), 'memory')}
        </div>

        <div class="aigateway-column">
          <div class="aigateway-ops-card">
            <div class="aigateway-ops-grid">
              ${renderAiGatewayOpsMetric('Uptime', `${Number(a.uptime_day || 0)} day${Number(a.uptime_day || 0) === 1 ? '' : 's'}`)}
              ${renderAiGatewayLastSyncMetric(a.last_sync_time)}
            </div>
            <div class="aigateway-reachability-block">
              <h4>Reachability</h4>
              <div class="aigateway-reachability">
                ${reachability.length ? reachability.map(renderAiGatewayReachabilityButton).join('') : '<span class="aigateway-muted">No reachability data</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderAiGatewayUsageWidget(label, percent, detailHtml, type) {
  const state = getAiGatewayUsageState(percent);
  return `
    <div class="aigateway-usage-card aigateway-usage-card--${escapeHtml(type)} aigateway-usage-card--${state.tone}" style="--gauge:${percent};">
      <div class="aigateway-usage-topline">
        <div class="aigateway-usage-title">
          <span class="aigateway-usage-icon" aria-hidden="true">${renderAiGatewayMetricIcon(type)}</span>
          <span>${escapeHtml(label)}</span>
        </div>
        <span class="aigateway-usage-state">${escapeHtml(state.label)}</span>
      </div>
      <div class="aigateway-usage-value"><strong>${percent}%</strong><span>${escapeHtml(state.description)}</span></div>
      <div class="aigateway-usage-meter" aria-hidden="true"><span></span></div>
      ${detailHtml}
    </div>
  `;
}

function renderAiGatewayCurrentUsage(memory) {
  return `
    <div class="aigateway-usage-detail">
      <div class="aigateway-detail-head">
        <span class="aigateway-card-eyebrow">Current usage</span>
        <strong>${memory}%</strong>
      </div>
      <div class="aigateway-memory-scale" aria-hidden="true">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  `;
}

function renderAiGatewayLoadAverage(values) {
  const labels = ['1 min', '5 min', '15 min'];
  const rows = labels.map((label, idx) => `
    <div class="aigateway-load-row">
      <span>${label}</span>
      <strong>${escapeHtml(values[idx] || '-')}</strong>
    </div>
  `).join('');

  return `
    <div class="aigateway-usage-detail">
      <div class="aigateway-detail-head">
        <span class="aigateway-card-eyebrow">Load average</span>
        <strong>${escapeHtml(values.join(' / ') || '-')}</strong>
      </div>
      <div class="aigateway-load-rows">${rows}</div>
    </div>
  `;
}

function renderAiGatewayMetricIcon(type) {
  if (type === 'memory') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/></svg>';
  }
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 13a8 8 0 1 1 16 0"/><path d="M12 13l4-4"/><path d="M3 21h18"/></svg>';
}

function getAiGatewayUsageState(percent) {
  if (percent >= 85) return { tone: 'critical', label: 'Critical', description: 'Action needed' };
  if (percent >= 70) return { tone: 'elevated', label: 'Elevated', description: 'Watch closely' };
  return { tone: 'healthy', label: 'Healthy', description: 'Nominal load' };
}

function renderAiGatewayOpsMetric(label, value) {
  return `
    <div class="aigateway-ops-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderAiGatewayLastSyncMetric(value) {
  const nextSyncAt = getAiGatewayNextSyncAt(value);
  const attr = nextSyncAt ? ` data-next-sync-at="${nextSyncAt}"` : '';
  return `
    <div class="aigateway-ops-metric aigateway-ops-metric--sync">
      <div class="aigateway-ops-metric-main">
        <span>Last sync</span>
        <strong>${escapeHtml(formatAiGatewayDate(value))}</strong>
      </div>
      <div class="aigateway-sync-countdown"${attr}>
        <span>Next expected sync</span>
        <strong>${escapeHtml(formatAiGatewaySyncCountdown(nextSyncAt))}</strong>
      </div>
    </div>
  `;
}

function renderAiGatewayReachabilityButton(item) {
  const rawStatus = String(item.status || '').trim().toLowerCase();
  const label = rawStatus === 'linked' ? 'Linked' : 'Not-linked';
  return `
    <button type="button" class="aigateway-reachability-btn">
      <span>${escapeHtml(item.name || '-')}</span>
      <strong>${label}</strong>
    </button>
  `;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function formatAiGatewayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

let aigatewaySyncCountdownTimer = null;

function getAiGatewayNextSyncAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  const intervalMs = 30 * 60 * 1000;
  let nextSyncAt = date.getTime() + intervalMs;
  const now = Date.now();
  if (nextSyncAt <= now) {
    nextSyncAt += (Math.floor((now - nextSyncAt) / intervalMs) + 1) * intervalMs;
  }
  return nextSyncAt;
}

function startAiGatewaySyncCountdowns() {
  stopAiGatewaySyncCountdowns();
  updateAiGatewaySyncCountdowns();
  if (document.querySelector('[data-next-sync-at]')) {
    aigatewaySyncCountdownTimer = setInterval(updateAiGatewaySyncCountdowns, 1000);
  }
}

function stopAiGatewaySyncCountdowns() {
  if (aigatewaySyncCountdownTimer) {
    clearInterval(aigatewaySyncCountdownTimer);
    aigatewaySyncCountdownTimer = null;
  }
}

function updateAiGatewaySyncCountdowns() {
  document.querySelectorAll('[data-next-sync-at]').forEach(el => {
    const valueEl = el.querySelector('strong');
    if (valueEl) valueEl.textContent = formatAiGatewaySyncCountdown(Number(el.dataset.nextSyncAt));
  });
}

function formatAiGatewaySyncCountdown(nextSyncAt) {
  if (!Number.isFinite(nextSyncAt)) return '-';
  const remaining = Math.max(0, nextSyncAt - Date.now());
  const minutes = Math.max(1, Math.ceil(remaining / 60000));
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// ── Model settings ──

async function loadModelSettings() {
  try {
    const res = await apiFetch('/api/admin/settings/models');
    const d = await res.json();
    const enabled = d.enabled_models; // null = all enabled

    ['openai', 'bedrock'].forEach(provider => {
      const container = document.getElementById(`model-list-${provider}`);
      if (!container) return;
      container.innerHTML = MODELS[provider].map(m => {
        const checked = enabled === null || enabled.includes(m.value) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary);">
          <input type="checkbox" value="${m.value}" ${checked}
            style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;" />
          ${m.label}
        </label>`;
      }).join('');
    });
  } catch {}
}

async function saveModelSettings() {
  const enabled = [];
  document.querySelectorAll('#model-list-openai input[type=checkbox]:checked, #model-list-bedrock input[type=checkbox]:checked')
    .forEach(cb => enabled.push(cb.value));

  const res = await apiFetch('/api/admin/settings/models', {
    method: 'PUT',
    body: JSON.stringify({ enabled_models: enabled })
  });
  const msg = document.getElementById('models-save-msg');
  if (res.ok) {
    msg.textContent = '✓ Saved!'; msg.style.color = 'var(--success)'; msg.style.display = 'inline';
    setTimeout(() => msg.style.display = 'none', 3000);
  } else {
    msg.textContent = '✗ Error saving'; msg.style.color = 'var(--danger)'; msg.style.display = 'inline';
  }
}

// ── Provider API tokens ──

async function loadProviderTokens() {
  try {
    const res = await apiFetch('/api/admin/settings/provider-tokens');
    const d = await res.json();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.placeholder = val || el.placeholder; };
    set('prov-openai-key', d.openai ? `Current: ${d.openai}` : 'sk-… (paste to update)');
    set('prov-bedrock-key', d.bedrock_key ? `Current: ${d.bedrock_key}` : 'AKIA… (paste to update)');
    set('prov-bedrock-secret', d.bedrock_secret ? `Current: ${d.bedrock_secret}` : '(paste to update)');
    const regionEl = document.getElementById('prov-bedrock-region');
    if (regionEl && d.bedrock_region) regionEl.value = d.bedrock_region;
  } catch {}
}

async function testProviderConnection(provider) {
  const msgEl = document.getElementById(`prov-${provider}-msg`);
  msgEl.textContent = 'Testing…';
  msgEl.style.color = 'var(--text-muted)';
  msgEl.style.display = 'block';

  try {
    const res = await apiFetch(`/api/admin/settings/provider-tokens/test/${provider}`);
    const d = await res.json();
    if (res.ok && d.ok) {
      msgEl.textContent = `✓ ${d.message || 'Connected successfully'}`;
      msgEl.style.color = 'var(--success)';
    } else {
      msgEl.textContent = `✗ ${d.error || 'Connection failed'}`;
      msgEl.style.color = 'var(--danger)';
    }
  } catch (e) {
    msgEl.textContent = `✗ ${e.message}`;
    msgEl.style.color = 'var(--danger)';
  }
}

async function saveProviderTokens() {
  const body = {
    openai: document.getElementById('prov-openai-key').value.trim(),
    bedrock_key: document.getElementById('prov-bedrock-key').value.trim(),
    bedrock_secret: document.getElementById('prov-bedrock-secret').value.trim(),
    bedrock_region: document.getElementById('prov-bedrock-region').value.trim(),
  };
  const res = await apiFetch('/api/admin/settings/provider-tokens', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  const msg = document.getElementById('prov-save-msg');
  if (res.ok) {
    ['prov-openai-key', 'prov-bedrock-key', 'prov-bedrock-secret'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    msg.textContent = '✓ Saved!'; msg.style.color = 'var(--success)'; msg.style.display = 'inline';
    loadProviderTokens();
    setTimeout(() => msg.style.display = 'none', 3000);
  } else {
    msg.textContent = '✗ Error saving'; msg.style.color = 'var(--danger)'; msg.style.display = 'inline';
  }
}

// ── Conversations (by user) ──

function showUserList() {
  document.getElementById('conv-users-view').style.display = 'block';
  document.getElementById('conv-detail-view').style.display = 'none';
  selectedUserCode = null;
}

async function loadAdminConversations() {
  const res = await apiFetch('/api/admin/conversations');
  const users = await res.json();
  const tbody = document.getElementById('conv-users-tbody');
  const c_ = 'text-align:center;vertical-align:middle;';
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="${c_}border-right:2px solid var(--border);white-space:nowrap;"><span style="font-size:18px;vertical-align:middle;margin-right:6px;">${u.icon || '🎓'}</span><strong style="color:var(--text-primary);vertical-align:middle;">${escapeHtml(u.username || u.code)}</strong></td>
      <td style="${c_}font-weight:600;">${u.conversation_count || 0}</td>
      <td style="${c_}font-weight:600;">${u.message_count || 0}</td>
      <td style="${c_}color:var(--text-muted);border-right:2px solid var(--border);">${u.last_activity ? new Date(u.last_activity).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '—'}</td>
      <td style="${c_}">
        <button class="row-icon-btn row-icon-btn--info" onclick="openUserConversations('${escapeHtml(u.code)}')" title="Detail" aria-label="Detail" ${Number(u.conversation_count || 0) <= 0 ? 'disabled' : ''}>${rowActionIcon('detail')}</button>
      </td>
      <td style="${c_}">
        <button class="row-icon-btn row-icon-btn--danger" onclick="deleteUserConvsById('${escapeHtml(u.code)}')" title="${adminT('btn_delete')}" aria-label="${adminT('btn_delete')}">${rowActionIcon('delete-student')}</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">${adminT('state_no_conversations_yet')}</td></tr>`;
}

async function openUserConversations(code) {
  selectedUserCode = code;
  document.getElementById('conv-users-view').style.display = 'none';
  document.getElementById('conv-detail-view').style.display = 'block';
  document.getElementById('conv-detail-title').textContent = code;

  const res = await apiFetch(`/api/admin/conversations/user/${code}`);
  const convs = await res.json();
  const tbody = document.getElementById('conv-detail-tbody');
  const c_ = 'text-align:center;vertical-align:middle;';
  tbody.innerHTML = convs.map(c => `
    <tr>
      <td style="vertical-align:middle;border-right:2px solid var(--border);font-weight:600;">${escapeHtml(c.title)}</td>
      <td style="${c_}font-weight:600;">${c.message_count || 0}</td>
      <td style="${c_}color:var(--text-muted);border-right:2px solid var(--border);">${new Date(c.updated_at).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })}</td>
      <td style="${c_}"><button class="row-icon-btn row-icon-btn--info" onclick="showAdminConversationDetail('${escapeHtml(c.id)}')" title="Detail" aria-label="Detail">${rowActionIcon('detail')}</button></td>
      <td style="${c_}"><button class="row-icon-btn row-icon-btn--danger" onclick="adminDeleteConv('${escapeHtml(c.id)}')" title="${adminT('btn_delete')}" aria-label="${adminT('btn_delete')}">${rowActionIcon('delete-student')}</button></td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">${adminT('state_no_conversations')}</td></tr>`;
}

async function showAdminConversationDetail(id) {
  const res = await apiFetch(`/api/admin/conversations/single/${id}/messages`);
  const data = await res.json();
  if (!res.ok) {
    showAlert(adminT('state_error'), escapeHtml(data.error || `HTTP ${res.status}`), null, 'error');
    return;
  }
  const conv = data.conversation || {};
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const body = `
    <div class="conversation-detail-modal">
      <div class="conversation-detail-meta">
        <strong>${escapeHtml(conv.title || 'Conversation')}</strong>
        <span>${escapeHtml(conv.access_code || '')}</span>
      </div>
      <div class="conversation-detail-messages">
        ${messages.length ? messages.map(m => `
          <div class="conversation-detail-message conversation-detail-message--${escapeHtml(m.role || 'message')}">
            <div class="conversation-detail-message-meta">
              <span>${escapeHtml(m.role || 'message')}</span>
              <span>${m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
            </div>
            <div class="conversation-detail-message-body">${escapeHtml(m.content || '')}</div>
          </div>
        `).join('') : '<div style="color:var(--text-muted);font-size:13px;">No messages in this conversation.</div>'}
      </div>
    </div>`;
  showAlert('Conversation detail', body, null, 'info');
}

async function deleteUserConvs() {
  if (!selectedUserCode) return;
  showConfirm({ title: adminT('confirm_delete_conversations_title'), subtitle: selectedUserCode, body: adminT('confirm_delete_conversations_body', { code: selectedUserCode }), onOk: async () => { await apiFetch(`/api/admin/conversations/user/${selectedUserCode}`, { method: 'DELETE' }); openUserConversations(selectedUserCode); loadAdminConversations(); } }); return;
  await apiFetch(`/api/admin/conversations/user/${selectedUserCode}`, { method: 'DELETE' });
  openUserConversations(selectedUserCode);
  loadAdminConversations();
}

async function deleteUserConvsById(code) {
  showConfirm({ title: adminT('confirm_delete_conversations_title'), subtitle: code, body: adminT('confirm_delete_conversations_body', { code }), onOk: async () => { await apiFetch(`/api/admin/conversations/user/${code}`, { method: 'DELETE' }); loadAdminConversations(); } }); return;
  await apiFetch(`/api/admin/conversations/user/${code}`, { method: 'DELETE' });
  loadAdminConversations();
}

async function adminDeleteConv(id) {
  showConfirm({ title: adminT('confirm_delete_conversation_title'), body: adminT('confirm_delete_conversation_body'), onOk: async () => { await apiFetch(`/api/admin/conversations/single/${id}`, { method: 'DELETE' }); openUserConversations(selectedUserCode); } }); return;
  await apiFetch(`/api/admin/conversations/single/${id}`, { method: 'DELETE' });
  if (selectedUserCode) openUserConversations(selectedUserCode);
}

async function deleteAllConversations() {
  showConfirm({ title: adminT('confirm_delete_all_conversations_title'), body: adminT('confirm_delete_all_conversations_body'), onOk: async () => { await apiFetch('/api/admin/conversations', { method: 'DELETE' }); showUserList(); loadAdminConversations(); loadDashboard(); } }); return;
  await apiFetch('/api/admin/conversations', { method: 'DELETE' });
  showUserList();
  loadAdminConversations();
}

function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : str;
}

/* ── Helpers ── */
async function apiFetch(url, options = {}, _retry = true) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    handleLogout();
  }
  return res;
}

/* ── Table sort ── */
const _sortState = {};

function sortTable(tbodyId, thEl) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr')];
  if (rows.length <= 1 && rows[0]?.cells.length === 1) return;

  const prev = _sortState[tbodyId] || 'none';
  const next = prev === 'asc' ? 'desc' : 'asc';
  _sortState[tbodyId] = next;

  const table = tbody.closest('table');
  const allThs = [...table.querySelectorAll('th[data-sortable]')];
  allThs.forEach(th => {
    th.querySelector('.sort-arrow').textContent = '⇅';
    th.setAttribute('aria-sort', 'none');
  });
  thEl.querySelector('.sort-arrow').textContent = next === 'asc' ? '↑' : '↓';
  thEl.setAttribute('aria-sort', next);

  // Find which visible column index this th corresponds to
  const colIndex = thEl.dataset.colIndex !== undefined
    ? parseInt(thEl.dataset.colIndex)
    : 0;
  const numeric = thEl.dataset.sortNumeric === 'true';

  rows.sort((a, b) => {
    const ta = (a.cells[colIndex]?.innerText || '').trim();
    const tb = (b.cells[colIndex]?.innerText || '').trim();
    if (numeric) {
      const na = parseFloat(ta.replace(/[^\d.-]/g, ''));
      const nb = parseFloat(tb.replace(/[^\d.-]/g, ''));
      const va = isNaN(na) ? -Infinity : na;
      const vb = isNaN(nb) ? -Infinity : nb;
      return next === 'asc' ? va - vb : vb - va;
    }
    return next === 'asc' ? ta.toLowerCase().localeCompare(tb.toLowerCase()) : tb.toLowerCase().localeCompare(ta.toLowerCase());
  });
  rows.forEach(r => tbody.appendChild(r));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Admin i18n ──────────────────────────────────────────────────────────────
let _adminI18n = null;

async function loadAdminI18n() {
  if (_adminI18n) return _adminI18n;
  try {
    const r = await fetch('/js/admin-i18n.json?v=2');
    _adminI18n = await r.json();
  } catch (e) { _adminI18n = {}; }
  return _adminI18n;
}

function adminT(key, vars = {}) {
  const lang = localStorage.getItem('cd_lang') || (typeof currentLang !== 'undefined' ? currentLang : 'en') || 'en';
  const dict = _adminI18n || {};
  let value = dict[lang]?.[key] || dict.en?.[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    value = value.replaceAll(`{${k}}`, v);
  });
  return value;
}

// ── MCP Servers (admin) ──────────────────────────────────
let _mcpServers = [];

async function loadMcpServers() {
  const tbody = document.getElementById('mcp-servers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-size:12px;">Loading…</td></tr>';
  try {
    const res = await apiFetch('/api/admin/mcp-servers');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const servers = Array.isArray(data) ? data : [];
    _mcpServers = servers;
    updateMcpToggleAllButton();
    tbody.innerHTML = '';
    if (!servers.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-size:12px;">No MCP servers yet. Click “Sync from Netskope” to load.</td></tr>';
      return;
    }
    servers.forEach(s => {
      const isVisible = s.visible !== 0;
      const badge = s.type === 'predefined'
        ? '<span style="font-size:10px;background:rgba(0,102,255,0.15);color:var(--accent);padding:2px 7px;border-radius:10px;font-weight:600;">predefined</span>'
        : `<span style="font-size:10px;background:var(--bg-tertiary);color:var(--text-muted);padding:2px 7px;border-radius:10px;">${escapeHtml(s.type||'')}</span>`;
      const visBtn = `<button class="row-icon-btn ${isVisible ? 'row-icon-btn--policy' : ''}" onclick="toggleMcpVisibility('${escapeHtml(s.id)}', ${isVisible ? 0 : 1}, this)" title="${isVisible ? 'Visible to participants' : 'Hidden from participants'}" aria-label="${isVisible ? 'Visible to participants' : 'Hidden from participants'}">
        ${rowActionIcon(isVisible ? 'visible' : 'hidden')}
      </button>`;
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(s.host || '')}:${s.port || ''}</td>
          <td class="resource-main-end">${badge}</td>
          <td class="resource-action-cell">${visBtn}</td>
        </tr>`);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);font-size:12px;">Error: ${escapeHtml(e.message)}</td></tr>`;
  }
}

// Sync the MCP list from the Netskope tenant into the local cache, then render.
// Mirrors retrieveAiProviders(): the tenant is only ever contacted on demand.
async function retrieveMcpServers() {
  showConfirm({
    title: 'Sync MCP Servers from Netskope',
    subtitle: 'This will refresh the cached server list',
    body: 'The MCP server list will be replaced with what is currently configured in your Netskope tenant. Visibility settings for servers that still exist are kept.',
    okLabel: 'Sync',
    onOk: async () => {
      const btn = document.getElementById('retrieve-mcp-btn');
      const label = document.getElementById('sync-mcp-label');
      if (btn) btn.disabled = true;
      if (label) label.textContent = 'Syncing…';
      try {
        const res = await apiFetch('/api/admin/mcp-servers/retrieve', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) { showAlert(adminT('state_error'), data.error || `Error ${res.status}`); return; }
        _mcpServers = Array.isArray(data.servers) ? data.servers : [];
        renderMcpServersRows();
      } catch (e) {
        showAlert(adminT('state_error'), e.message);
      } finally {
        if (btn) btn.disabled = false;
        if (label) label.textContent = 'Sync from Netskope';
      }
    },
  });
}

async function toggleMcpVisibility(id, visible, btn = null) {
  const nextVisible = visible ? 1 : 0;
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = rowActionIcon('working'); }
    const res = await apiFetch(`/api/admin/mcp-servers/${encodeURIComponent(id)}/visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: nextVisible })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const server = _mcpServers.find(s => String(s.id) === String(id));
    if (server) server.visible = nextVisible;
    renderMcpServersRows();
  } catch (e) {
    console.error('[MCP] toggleMcpVisibility error:', e);
    if (btn) btn.disabled = false;
    showAlert(adminT('state_error'), e.message);
  }
}

function renderMcpServersRows() {
  const tbody = document.getElementById('mcp-servers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  _mcpServers.forEach(s => {
    const isVisible = promptIsVisible(s.visible);
    const badge = s.type === 'predefined'
      ? '<span style="font-size:10px;background:rgba(0,102,255,0.15);color:var(--accent);padding:2px 7px;border-radius:10px;font-weight:600;">predefined</span>'
      : `<span style="font-size:10px;background:var(--bg-tertiary);color:var(--text-muted);padding:2px 7px;border-radius:10px;">${escapeHtml(s.type || '')}</span>`;
    tbody.insertAdjacentHTML('beforeend', `<tr>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(s.host || '')}:${s.port || ''}</td>
      <td class="resource-main-end">${badge}</td>
      <td class="resource-action-cell">
        <button class="row-icon-btn ${isVisible ? 'row-icon-btn--policy' : ''}" onclick="toggleMcpVisibility('${escapeHtml(s.id)}', ${isVisible ? 0 : 1}, this)" title="${isVisible ? 'Visible to participants' : 'Hidden from participants'}" aria-label="${isVisible ? 'Visible to participants' : 'Hidden from participants'}">
          ${rowActionIcon(isVisible ? 'visible' : 'hidden')}
        </button>
      </td>
    </tr>`);
  });
  updateMcpToggleAllButton();
}

function updateMcpToggleAllButton() {
  const btn = document.getElementById('mcp-toggle-all-btn');
  if (!btn) return;
  const allVisible = _mcpServers.length > 0 && _mcpServers.every(s => promptIsVisible(s.visible));
  btn.disabled = _mcpServers.length === 0;
  btn.title = allVisible ? 'Hide all MCP servers' : 'Show all MCP servers';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = rowActionIcon(allVisible ? 'hidden' : 'visible');
}

async function toggleAllMcpVisible() {
  if (!_mcpServers.length) return;
  const nextVisible = _mcpServers.every(s => promptIsVisible(s.visible)) ? 0 : 1;
  const btn = document.getElementById('mcp-toggle-all-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = rowActionIcon('working'); }
  try {
    await Promise.all(_mcpServers.map(s => apiFetch(`/api/admin/mcp-servers/${encodeURIComponent(s.id)}/visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: nextVisible })
    }).then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); })));
    _mcpServers.forEach(s => { s.visible = nextVisible; });
    renderMcpServersRows();
  } catch (e) {
    showAlert(adminT('state_error'), e.message);
    updateMcpToggleAllButton();
  }
}

async function applyAdminLang(lang) {
  const all = await loadAdminI18n();
  const t = all[lang] || all['en'] || {};
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!t[key]) return;
    // Keys with HTML markup (type label for factory reset modal)
    if (key === 'modal_factory_reset_type_label') {
      el.innerHTML = t[key];
    } else {
      el.textContent = t[key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (t[key]) el.placeholder = t[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (t[key]) el.title = t[key];
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.dataset.i18nAriaLabel;
    if (t[key]) el.setAttribute('aria-label', t[key]);
  });
  if (document.getElementById('setup-wizard-overlay')?.style.display === 'flex') {
    buildWizardDots();
    updateWizardNav();
    renderWizardStep1();
  }
  const adminScreen = document.getElementById('admin-screen');
  const adminScreenVisible = adminScreen && getComputedStyle(adminScreen).display !== 'none';
  const activeSection = document.querySelector('.admin-section.active')?.id;
  if (adminScreenVisible) {
    if (activeSection === 'section-dashboard') loadDashboard();
    if (activeSection === 'section-codes') loadAdminCodes();
    if (activeSection === 'section-prompts') {
      renderPromptRowActions();
      loadPromptLibrary();
    }
    if (activeSection === 'section-apikeys') loadApiKeys();
    if (activeSection === 'section-admins') loadAdmins();
    if (activeSection === 'section-conversations') loadAdminConversations();
  }
}

/* ── Setup Wizard ── */

const WIZARD_TOTAL = 9;
const WIZARD_LABEL_KEYS = ['wizard_updates', 'wizard_keep_in_mind', 'wizard_tenant', 'wizard_gateway', 'wizard_providers', 'wizard_mcp', 'wizard_prompts', 'wizard_challenges', 'wizard_complete'];
let _wizStep = 1;
let _wizStatus = {};

async function checkSetupWizard() {
  try {
    const res = await apiFetch('/api/admin/settings/setup-status');
    if (!res.ok) return;
    _wizStatus = await res.json();
    const needsSetup = !_wizStatus.gateway_url || !_wizStatus.netskope_tenant || !_wizStatus.has_api_token;
    if (needsSetup && !_wizStatus.wizard_dismissed) openSetupWizard();
  } catch {}
}

async function openSetupWizard() {
  await loadAdminI18n();
  _wizStep = 1;
  buildWizardDots();
  renderWizardStep1();
  updateWizardNav();
  const overlay = document.getElementById('setup-wizard-overlay');
  overlay.querySelectorAll('button').forEach(btn => { btn.type = 'button'; });
  overlay.style.display = 'flex';
}

function wizSkip() {
  document.getElementById('setup-wizard-overlay').style.display = 'none';
  if (_wizStatus) _wizStatus.wizard_dismissed = true;
  // Persist so the wizard won't auto-show again on reload
  apiFetch('/api/admin/settings/dismiss-wizard', { method: 'POST' }).catch(() => {});
}

function buildWizardDots() {
  const c = document.getElementById('wizard-steps');
  c.innerHTML = Array.from({length: WIZARD_TOTAL}, (_, i) =>
    `<div class="wizard-step-dot${i === 0 ? ' active' : ''}" id="wdot-${i+1}" data-step="${i + 1}">${adminT(WIZARD_LABEL_KEYS[i])}</div>`
  ).join('');
}

function updateWizardNav() {
  const pct = ((_wizStep - 1) / (WIZARD_TOTAL - 1)) * 100;
  document.getElementById('wizard-progress-bar').style.width = pct + '%';
  document.getElementById('wizard-progress-label').textContent = adminT('wizard_step_label', { step: _wizStep, total: WIZARD_TOTAL });
  document.getElementById('wizard-progress-title').textContent = adminT(WIZARD_LABEL_KEYS[_wizStep - 1]);
  document.querySelectorAll('.wizard-step-dot').forEach((d, i) => {
    d.classList.toggle('done',   i + 1 < _wizStep);
    d.classList.toggle('active', i + 1 === _wizStep);
  });
  document.querySelectorAll('.wizard-step').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === _wizStep);
  });
  document.getElementById('wizard-back-btn').style.display = _wizStep > 1 ? '' : 'none';
  const nextBtn = document.getElementById('wizard-next-btn');
  const skipBtn = document.getElementById('wizard-skip-btn');
  if (_wizStep === WIZARD_TOTAL) {
    nextBtn.textContent = adminT('wizard_go_dashboard');
    skipBtn.style.display = 'none';
  } else {
    nextBtn.innerHTML = `${adminT('wizard_next')} →`;
    skipBtn.style.display = '';
  }
}

async function wizNav(dir) {
  if (dir === 1) {
    if (_wizStep === 3 && !await wizSaveTenant()) return;
    if (_wizStep === 4 && !await wizSaveGateway()) return;
    if (_wizStep === WIZARD_TOTAL) { wizSkip(); adminTab('dashboard'); return; }
  }
  _wizStep = Math.max(1, Math.min(WIZARD_TOTAL, _wizStep + dir));
  if (_wizStep === WIZARD_TOTAL) renderWizardSummary();
  updateWizardNav();
}

function renderWizardStep1() {
  const s = _wizStatus;
  if (s.netskope_tenant) document.getElementById('wiz-tenant').value = s.netskope_tenant;
  if (s.gateway_url)     document.getElementById('wiz-gateway-url').value = s.gateway_url;
}

async function wizTestConnection() {
  const msg = document.getElementById('wiz-tenant-msg');
  const saved = await wizSaveTenant();
  if (!saved) return;
  msg.className = 'wizard-msg'; msg.textContent = 'Testing…';
  try {
    const res = await apiFetch('/api/admin/netskope/sync-preview');
    const d = await res.json();
    if (res.ok) {
      msg.className = 'wizard-msg ok';
      msg.textContent = '✓ Connected';
    } else {
      msg.className = 'wizard-msg err'; msg.textContent = `✗ ${d.error}`;
    }
  } catch (e) {
    msg.className = 'wizard-msg err'; msg.textContent = `✗ ${e.message}`;
  }
}

async function wizSaveTenant() {
  const tenant = document.getElementById('wiz-tenant').value.trim();
  const token  = document.getElementById('wiz-api-token').value.trim();
  const msg    = document.getElementById('wiz-tenant-msg');
  if (!tenant) { msg.className = 'wizard-msg err'; msg.textContent = 'Tenant hostname is required.'; return false; }
  if (!token && !_wizStatus.has_api_token) { msg.className = 'wizard-msg err'; msg.textContent = 'API token is required.'; return false; }
  msg.className = 'wizard-msg'; msg.textContent = 'Saving…';
  const body = { tenant };
  if (token) body.api_token = token;
  const res = await apiFetch('/api/admin/settings/netskope', { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) { msg.className = 'wizard-msg err'; msg.textContent = 'Failed to save.'; return false; }
  msg.className = 'wizard-msg ok'; msg.textContent = '✓ Saved';
  _wizStatus.netskope_tenant = tenant;
  if (token) _wizStatus.has_api_token = true;
  return true;
}

async function wizSaveGateway() {
  const url = document.getElementById('wiz-gateway-url').value.trim();
  const msg = document.getElementById('wiz-gateway-msg');
  if (!url) { msg.className = 'wizard-msg err'; msg.textContent = 'Gateway URL is required.'; return false; }
  msg.className = 'wizard-msg'; msg.textContent = 'Saving…';
  const res = await apiFetch('/api/admin/settings/gateway-url', { method: 'PUT', body: JSON.stringify({ gateway_url: url }) });
  if (!res.ok) { msg.className = 'wizard-msg err'; msg.textContent = 'Failed to save.'; return false; }
  msg.className = 'wizard-msg ok'; msg.textContent = '✓ Saved';
  _wizStatus.gateway_url = url;
  return true;
}

async function wizRetrieveProviders() {
  const btn = document.getElementById('wiz-retrieve-btn');
  const out = document.getElementById('wiz-providers-result');
  btn.disabled = true; btn.textContent = 'Retrieving…';
  out.textContent = '';
  try {
    const res = await apiFetch('/api/admin/aiproviders/retrieve', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Unable to retrieve providers (HTTP ${res.status})`);
    _wizStatus.provider_count = data.providers.length;
    _wizStatus.provider_count = data.providers.length;
    btn.textContent = '✓ Done';
    const listRes = await apiFetch('/api/admin/aiproviders');
    const listData = await listRes.json();
    const providers = Array.isArray(listData) ? listData : [];
    out.innerHTML = `
      <div style="color:var(--success);margin-bottom:10px;">✓ ${providers.length} provider${providers.length===1?'':'s'} retrieved.</div>
      ${providers.length ? `<div class="wiz-toggle-list">${providers.map(p => `
        <div class="wiz-provider-block" id="wiz-prov-block-${p.id}">
          <div class="wiz-toggle-row">
            <span class="wiz-toggle-name">${escapeHtml(p.name || p.schema || String(p.id))}</span>
            <label class="mcp-toggle">
              <input type="checkbox" ${p.visible ? 'checked' : ''} onchange="wizToggleAiProvider('${escapeHtml(String(p.id))}', this.checked, this)">
              <span class="mcp-toggle-track"></span>
              <span class="mcp-toggle-thumb"></span>
            </label>
          </div>
          <div class="wiz-token-row" id="wiz-prov-token-${p.id}" style="display:${p.visible ? 'flex' : 'none'};">
            <input type="password" class="wiz-token-input" id="wiz-prov-key-${p.id}" placeholder="API Key" value="${p.api_token ? '••••••••' + p.api_token.slice(-4) : ''}" autocomplete="off" data-1p-ignore data-lpignore="true">
            <button class="row-icon-btn row-icon-btn--policy" onclick="wizSaveProviderToken(${p.id})" title="Save API key" aria-label="Save API key">${rowActionIcon('save')}</button>
            <button class="btn-secondary" onclick="wizTestProviderToken(${p.id}, '${escapeHtml(p.name || String(p.id))}')">Test</button>
            <span class="wizard-msg" id="wiz-prov-msg-${p.id}" style="font-size:12px;"></span>
          </div>
        </div>`).join('')}</div>` : ''}`;
  } catch (e) {
    const message = e?.message && !e.message.includes("Cannot read properties of null")
      ? e.message
      : 'Unable to retrieve providers. Go back to the Tenant step, verify the API token, and test the connection.';
    out.innerHTML = `<div class="wizard-provider-error"><strong>Could not retrieve AI providers</strong><span>${escapeHtml(message)}</span></div>`;
    btn.disabled = false; btn.textContent = 'Retry';
  }
}

async function wizToggleAiProvider(id, enabled, checkbox) {
  try {
    const r = await apiFetch(`/api/admin/aiproviders/${encodeURIComponent(id)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visible: enabled ? 1 : 0 }) });
    if (!r.ok) { checkbox.checked = !enabled; return; }
    const tokenRow = document.getElementById(`wiz-prov-token-${id}`);
    if (tokenRow) tokenRow.style.display = enabled ? 'flex' : 'none';
  } catch { checkbox.checked = !enabled; }
}

async function wizSaveProviderToken(id) {
  const input = document.getElementById(`wiz-prov-key-${id}`);
  const msg = document.getElementById(`wiz-prov-msg-${id}`);
  const val = input?.value?.trim();
  if (!val || val.startsWith('••••')) { if (msg) { msg.className = 'wizard-msg err'; msg.textContent = 'Enter a new key to save'; } return; }
  try {
    const r = await apiFetch(`/api/admin/aiproviders/${encodeURIComponent(id)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ api_token: val }) });
    if (r.ok) {
      input.value = '••••••••' + val.slice(-4);
      if (msg) { msg.className = 'wizard-msg ok'; msg.textContent = '✓ Saved'; }
    } else {
      const d = await r.json();
      if (msg) { msg.className = 'wizard-msg err'; msg.textContent = `✗ ${d.error || 'Error'}`; }
    }
  } catch (e) { if (msg) { msg.className = 'wizard-msg err'; msg.textContent = `✗ ${e.message}`; } }
}

async function wizTestProviderToken(id, name) {
  const msg = document.getElementById(`wiz-prov-msg-${id}`);
  if (msg) { msg.className = 'wizard-msg'; msg.textContent = 'Testing…'; }
  try {
    const r = await apiFetch(`/api/admin/aiproviders/${encodeURIComponent(id)}/test`, { method: 'POST' });
    const d = await r.json();
    if (r.ok && d.ok) {
      if (msg) { msg.className = 'wizard-msg ok'; msg.textContent = '✓ Connected'; }
    } else {
      if (msg) { msg.className = 'wizard-msg err'; msg.textContent = `✗ ${d.error || 'Failed'}`; }
    }
  } catch (e) { if (msg) { msg.className = 'wizard-msg err'; msg.textContent = `✗ ${e.message}`; } }
}

async function wizRetrieveMcpServers() {
  const btn = document.getElementById('wiz-mcp-btn');
  const out = document.getElementById('wiz-mcp-result');
  btn.disabled = true; btn.textContent = 'Discovering…';
  out.textContent = '';
  try {
    // Actively pull from the Netskope tenant (mirrors the AI Providers step and
    // Admin → MCP → Sync). A plain GET only reads the local cache, which is
    // empty on a fresh install and wrongly reported "No servers found".
    const res = await apiFetch('/api/admin/mcp-servers/retrieve', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    const servers = Array.isArray(data.servers) ? data.servers : [];
    _wizStatus.mcp_count = servers.length;
    const visible = servers.filter(s => s.visible !== 0).length;
    _wizStatus.mcp_count = servers.length;
    _wizStatus.mcp_visible_count = visible;
    btn.textContent = servers.length ? '✓ Discovered' : 'No servers found';
    out.innerHTML = servers.length
      ? `<div style="color:var(--success);margin-bottom:10px;">✓ ${servers.length} MCP server${servers.length===1?'':'s'} discovered.</div>
         <div class="wiz-toggle-list">${servers.map(s => `
           <div class="wiz-toggle-row">
             <span class="wiz-toggle-name">${escapeHtml(s.name || s.id || '')}</span>
             <label class="mcp-toggle">
               <input type="checkbox" ${s.visible !== 0 ? 'checked' : ''} onchange="wizToggleMcp('${escapeHtml(String(s.id))}', this.checked, this)">
               <span class="mcp-toggle-track"></span>
               <span class="mcp-toggle-thumb"></span>
             </label>
           </div>`).join('')}</div>`
      : '<span style="color:var(--warning)">No MCP servers were found in this tenant.</span>';
  } catch (e) {
    out.innerHTML = `<span style="color:var(--danger)">${escapeHtml(e.message)}</span>`;
    btn.disabled = false; btn.textContent = 'Retry';
  }
}

async function wizToggleMcp(id, visible, checkbox) {
  try {
    const r = await apiFetch(`/api/admin/mcp-servers/${encodeURIComponent(id)}/visibility`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visible: visible ? 1 : 0 }) });
    if (!r.ok) checkbox.checked = !visible;
  } catch { checkbox.checked = !visible; }
}

async function wizSyncPromptTemplate() {
  const existingRes = await apiFetch('/api/admin/prompt-library').catch(() => null);
  const existing = existingRes?.ok ? await existingRes.json() : [];

  const doSync = async () => {
    const btn = document.getElementById('wiz-sync-prompts-btn');
    const msg = document.getElementById('wiz-prompts-msg');
    const inWizard = document.getElementById('setup-wizard-overlay')?.style.display !== 'none';
    if (inWizard) { btn.disabled = true; btn.textContent = 'Syncing template…'; msg.className = 'wizard-msg'; msg.textContent = 'Downloading Prompt Library template…'; }
    try {
      const res = await apiFetch('/api/admin/prompt-library/sync-template', { method: 'POST' });
      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw.trim().startsWith('<!DOCTYPE')
          ? 'Template sync endpoint is not available yet. Restart the Node server and try again.'
          : 'Template sync returned an invalid response.');
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      _wizStatus.prompt_count = (_wizStatus.prompt_count || 0) + data.imported;
      if (inWizard) { msg.className = 'wizard-msg ok'; msg.textContent = `✓ Sync ok — ${data.imported} prompt${data.imported === 1 ? '' : 's'} imported`; btn.textContent = '✓ Template synced'; }
      else { showAlert('Sync ok', `${data.imported} prompt${data.imported === 1 ? '' : 's'} imported from template.`, null, 'success'); }
      loadPromptLibrary();
    } catch (e) {
      if (inWizard) { msg.className = 'wizard-msg err'; msg.textContent = e.message; btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Retry template sync'; }
      else { showAlert('Sync failed', e.message); }
    }
  };

  const inWizard = document.getElementById('setup-wizard-overlay')?.style.display !== 'none';
  if (inWizard) {
    await doSync();
    return;
  }

  showConfirm({
    title: 'Import cloud Prompt Library template',
    subtitle: existing.length > 0 ? `This will delete ${existing.length} existing prompt${existing.length === 1 ? '' : 's'}` : 'Prompt Library is currently empty',
    body: 'Your current Prompt Library configuration will be permanently replaced with the cloud template. Any custom prompts you have added will be lost.',
    okLabel: 'Sync template',
    onOk: doSync,
  });
}

async function wizImportChallengesCSV(input) {
  const msg = document.getElementById('wiz-challenges-msg');
  const file = input.files[0];
  if (!file) return;
  msg.className = 'wizard-msg';
  msg.textContent = 'Importing…';
  try {
    const csv = await file.text();
    const res = await apiFetch('/api/admin/challenges/import-csv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    _wizStatus.challenge_count = (_wizStatus.challenge_count || 0) + data.imported;
    msg.className = 'wizard-msg ok';
    msg.textContent = `✓ ${data.imported} challenge${data.imported === 1 ? '' : 's'} imported from CSV`;
    input.value = '';
  } catch (e) {
    msg.className = 'wizard-msg err';
    msg.textContent = e.message;
  }
}

async function wizSyncChallengesTemplate() {
  const existingRes = await apiFetch('/api/challenges').catch(() => null);
  const existing = existingRes?.ok ? await existingRes.json() : [];

  const doSync = async () => {
    const btn = document.getElementById('wiz-sync-challenges-btn');
    const msg = document.getElementById('wiz-challenges-msg');
    const inWizard = document.getElementById('setup-wizard-overlay')?.style.display !== 'none';
    if (inWizard) { btn.disabled = true; btn.textContent = 'Syncing template…'; msg.className = 'wizard-msg'; msg.textContent = 'Downloading Challenges template…'; }
    try {
      const res = await apiFetch('/api/admin/challenges/sync-template', { method: 'POST' });
      const raw = await res.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw.trim().startsWith('<!DOCTYPE')
          ? 'Template sync endpoint is not available yet. Restart the Node server and try again.'
          : 'Template sync returned an invalid response.');
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      _wizStatus.challenge_count = (_wizStatus.challenge_count || 0) + data.imported;
      if (inWizard) { msg.className = 'wizard-msg ok'; msg.textContent = `✓ Sync ok — ${data.imported} challenge${data.imported === 1 ? '' : 's'} imported`; btn.textContent = '✓ Template synced'; }
      else { showAlert('Sync ok', `${data.imported} challenge${data.imported === 1 ? '' : 's'} imported from template.`, null, 'success'); }
      loadChallenges();
    } catch (e) {
      if (inWizard) { msg.className = 'wizard-msg err'; msg.textContent = e.message; btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Retry template sync'; }
      else { showAlert('Sync failed', e.message); }
    }
  };

  const inWizard = document.getElementById('setup-wizard-overlay')?.style.display !== 'none';
  if (inWizard) {
    await doSync();
    return;
  }

  showConfirm({
    title: 'Import CTF challenges',
    subtitle: existing.length > 0 ? `This will delete ${existing.length} existing challenge${existing.length === 1 ? '' : 's'}` : 'Challenges are currently empty',
    body: 'Your current Capture the Flag configuration will be permanently replaced with the cloud template. Any custom challenges you have added will be lost.',
    okLabel: 'Sync template',
    onOk: doSync,
  });
}

function renderWizardSummary() {
  const s = _wizStatus;
  document.getElementById('wizard-summary').innerHTML = `
    <div class="wizard-summary-row"><span>Netskope Tenant</span><span>${s.netskope_tenant || '—'}</span></div>
    <div class="wizard-summary-row"><span>API Token</span><span>${s.has_api_token ? '✓ Configured' : '—'}</span></div>
    <div class="wizard-summary-row"><span>AI Gateway URL</span><span>${s.gateway_url || '—'}</span></div>
    <div class="wizard-summary-row"><span>AI Providers</span><span>${s.provider_count || 0} providers</span></div>
    <div class="wizard-summary-row"><span>MCP Servers</span><span>${s.mcp_count || s.mcp_visible_count || 0} servers</span></div>
    <div class="wizard-summary-row"><span>Prompt Library</span><span>${s.prompt_count || 0} prompts</span></div>
    <div class="wizard-summary-row"><span>Challenges</span><span>${s.challenge_count || 0} challenges</span></div>
  `;
}

// ── Admin: Challenges ─────────────────────────────────────

const NS_EVENT_TYPES = ['page', 'application', 'alert', 'infrastructure', 'network', 'audit', 'incident'];

let _challengesCache = [];

async function loadCTFState() {
  try {
    const res = await fetch('/api/challenges/ctf-state');
    const data = await res.json();
    renderCTFStateButtons(data.state);
  } catch {}
}

function renderCTFStateButtons(state) {
  const labels = { stop: 'Stopped', standby: 'Standby', run: 'Running' };
  const colors = { stop: '#dc2626', standby: '#d97706', run: '#16a34a' };
  const darkColors = { stop: '#f87171', standby: '#fbbf24', run: '#4ade80' };
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const color = (isDark ? darkColors : colors)[state] || 'var(--text-primary)';

  // Header label
  const el = document.getElementById('ctf-state-text');
  if (el) { el.textContent = labels[state] || state; el.style.color = color; }

  // Header buttons
  ['stop', 'standby', 'run'].forEach(s => {
    const btn = document.getElementById(`ctf-btn-${s}`);
    if (btn) btn.className = 'ctf-state-btn' + (state === s ? ` active-${s}` : '');
  });

  // Capture the Flag panel semaphore
  ['stop', 'standby', 'run'].forEach(s => {
    const light = document.getElementById(`ctf-panel-light-${s}`);
    if (light) light.classList.toggle('active', state === s);
  });

  // Dashboard semaphore
  ['stop', 'standby', 'run'].forEach(s => {
    const light = document.getElementById(`dash-light-${s}`);
    if (light) light.classList.toggle('active', state === s);
  });
  const dashText = document.getElementById('dash-ctf-state-text');
  if (dashText) { dashText.textContent = labels[state] || state; dashText.style.color = color; }

  // Participant panel badge
  const badge = document.getElementById('ctf-status-badge');
  if (badge) {
    const isDarkB  = document.documentElement.getAttribute('data-theme') === 'dark';
    const dotColor = (isDarkB ? darkColors : colors)[state] || '#888';
    const bgMap = { stop: 'rgba(220,38,38,0.1)', standby: 'rgba(217,119,6,0.1)', run: 'rgba(22,163,74,0.1)' };
    badge.style.background = bgMap[state] || 'var(--bg-secondary)';
    badge.style.color = dotColor;
    badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0;"></span>${labels[state] || state}`;
  }
}

async function setCTFState(state) {
  try {
    const res = await apiFetch('/api/challenges/ctf-state', { method: 'POST', body: JSON.stringify({ state }) });
    const data = await res.json();
    if (data.ok) renderCTFStateButtons(data.state);
    pollCtfTimer(); // the semaphore pauses/resumes the countdown — refresh now
  } catch {}
}

// ══════════════════ CTF countdown timer (shared: admin + participant) ══════════════════
const _timer = { total: 0, remaining: 0, running: false, syncedAt: 0, hasData: false, state: 'stop' };
let _timerLastBeep = -1;
let _timerExpiredShown = false;
let _timerPollStarted = false;
let _timerAudioCtx = null;

function fmtHMS(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function timerStateColorClass(remaining, total) {
  if (total <= 0) return 'is-idle';
  if (remaining <= 0) return 'is-red';
  const state = _timer.state || (_timer.running ? 'run' : 'standby');
  if (state === 'run') {
    if (remaining <= 60) return 'is-red';
    if (remaining <= total * 0.5) return 'is-orange';
    return 'is-green';
  }
  if (state === 'standby') return 'is-orange';
  if (state === 'stop') return 'is-red';
  return _timer.running ? 'is-green' : 'is-paused';
}

function timerAudio() {
  try {
    if (!_timerAudioCtx) _timerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_timerAudioCtx.state === 'suspended') _timerAudioCtx.resume();
  } catch { return null; }
  return _timerAudioCtx;
}
function timerTone(freq, dur, gain) {
  const ctx = timerAudio(); if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain || 0.25, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function timerBeep() { timerTone(740, 0.14, 0.28); }
function timerBuzzer() { timerTone(440, 0.25, 0.3); setTimeout(() => timerTone(330, 0.6, 0.3), 260); }

function renderTimerUI(disp) {
  const total = _timer.total;
  const hasTimer = total > 0;
  const cls = !hasTimer ? 'is-idle' : timerStateColorClass(disp, total);
  const val = fmtHMS(disp);
  const pct = hasTimer ? Math.max(0, Math.min(100, Math.round((disp / total) * 100))) : 0;
  const STATES = ['is-idle', 'is-green', 'is-orange', 'is-red', 'is-paused', 'is-pulsing'];

  document.querySelectorAll('.ctf-timer-chip').forEach(chip => {
    chip.style.display = hasTimer ? 'inline-flex' : 'none';
    chip.classList.remove(...STATES);
    chip.classList.add(cls);
    if (cls === 'is-red' && _timer.running) chip.classList.add('is-pulsing');
    const v = chip.querySelector('.ctf-timer-val');
    if (v) v.textContent = (cls === 'is-paused' ? '⏸ ' : '') + val;
  });

  const banner = document.getElementById('ctf-timer-banner');
  if (banner) {
    banner.classList.remove(...STATES);
    banner.classList.add(cls);
    if (cls === 'is-red' && _timer.running) banner.classList.add('is-pulsing');
    const disEl = document.getElementById('ctf-timer-display');
    if (disEl) disEl.textContent = hasTimer ? val : '--:--:--';
    const stEl = document.getElementById('ctf-timer-status');
    if (stEl) {
      stEl.textContent = !hasTimer ? 'No timer set — the clock runs only while Capture the Flag is on Run.'
        : (disp <= 0 ? "Time's up — Capture the Flag moved to Standby."
        : (_timer.running ? 'Running' : 'Paused — set Capture the Flag to Run to resume.'));
    }
    const progressEl = document.getElementById('ctf-timer-progress');
    if (progressEl) progressEl.style.width = `${pct}%`;
    const trackEl = document.getElementById('ctf-timer-track');
    if (trackEl) {
      trackEl.style.setProperty('--timer-pct', `${pct * 3.6}deg`);
      trackEl.setAttribute('aria-valuenow', String(pct));
      trackEl.setAttribute('aria-valuetext', hasTimer ? `${pct}% remaining, ${val}` : 'No timer set');
    }
    const pctEl = document.getElementById('ctf-timer-percent');
    if (pctEl) pctEl.textContent = hasTimer ? `${pct}%` : '--';
    const totalEl = document.getElementById('ctf-timer-total');
    if (totalEl) totalEl.textContent = hasTimer ? `Total ${fmtHMS(total)}` : 'Total --';
    const modeEl = document.getElementById('ctf-timer-mode');
    if (modeEl) {
      modeEl.textContent = !hasTimer ? 'Idle' : (disp <= 0 ? 'Finished' : (_timer.running ? 'Live' : 'Paused'));
    }
  }
}

function tickCtfTimer() {
  if (!_timer.hasData) return;
  let disp = _timer.remaining;
  if (_timer.running) disp = _timer.remaining - (Date.now() - _timer.syncedAt) / 1000;
  disp = Math.max(0, disp);

  renderTimerUI(disp);

  if (disp > 10.5) _timerLastBeep = -1;
  if (disp > 0.5) _timerExpiredShown = false;

  if (_timer.running && _timer.total > 0) {
    const whole = Math.ceil(disp);
    if (whole >= 1 && whole <= 10 && whole !== _timerLastBeep) { _timerLastBeep = whole; timerBeep(); }
    if (disp <= 0 && !_timerExpiredShown) { _timerExpiredShown = true; onTimerExpired(); pollCtfTimer(); }
  }
}

function onTimerExpired() {
  timerBuzzer();
  updateChatInputState();
  if (document.getElementById('timer-splash')) return;
  const d = document.createElement('div');
  d.id = 'timer-splash'; d.className = 'timer-splash';
  d.innerHTML = '<div class="timer-splash-card"><div class="timer-splash-emoji">⏱️</div><div class="timer-splash-title">TIME’S UP!</div><div class="timer-splash-sub">Capture the Flag has ended.</div></div>';
  d.onclick = () => d.remove();
  document.body.appendChild(d);
  setTimeout(() => { d.classList.add('timer-splash--out'); setTimeout(() => d.remove(), 500); }, 6000);
}

function applyTimerData(t, state) {
  if (!t) return;
  _timer.total = t.total || 0;
  _timer.remaining = t.remaining || 0;
  _timer.running = !!t.running;
  if (state) _timer.state = state;
  _timer.syncedAt = Date.now();
  _timer.hasData = true;
}

async function pollCtfTimer() {
  try {
    const res = await fetch('/api/challenges/ctf-state');
    const data = await res.json();
    const state = data.state || 'stop';
    applyTimerData(data.timer, state);
    if (typeof _ctfState !== 'undefined' && _ctfState !== state) {
      _ctfState = state;
      if (typeof updateChatInputState === 'function') updateChatInputState();
    }
    if (typeof renderCTFStateButtons === 'function') renderCTFStateButtons(state);
    tickCtfTimer();
  } catch {}
}

function startCtfTimer() {
  if (_timerPollStarted) return;
  _timerPollStarted = true;
  pollCtfTimer();
  setInterval(pollCtfTimer, 10000);
  setInterval(tickCtfTimer, 1000);
}

// — Control Center banner actions —
async function ctfTimerApi(body) {
  try {
    const res = await apiFetch('/api/challenges/timer', { method: 'POST', body: JSON.stringify(body) });
    applyTimerData(await res.json());
    tickCtfTimer();
  } catch {}
}
function ctfTimerSet() {
  const hh = parseInt(document.getElementById('ctf-timer-hh')?.value, 10) || 0;
  const mm = parseInt(document.getElementById('ctf-timer-mm')?.value, 10) || 0;
  const ss = parseInt(document.getElementById('ctf-timer-ss')?.value, 10) || 0;
  const secs = hh * 3600 + mm * 60 + ss;
  if (secs <= 0) { if (typeof showAlert === 'function') showAlert('Invalid time', 'Enter a duration greater than zero.'); return; }
  ['ctf-timer-hh', 'ctf-timer-mm', 'ctf-timer-ss'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ctfTimerApi({ action: 'set', seconds: secs });
}
function ctfTimerPreset(s) { ctfTimerApi({ action: 'set', seconds: s }); }
function ctfTimerAdjust(d) { ctfTimerApi({ action: 'adjust', delta: d }); }
function ctfTimerReset() {
  if (_timer.running && typeof showConfirm === 'function') {
    showConfirm({ title: 'Reset timer?', subtitle: 'The countdown is running', body: 'This resets the remaining time back to the configured total. Continue?', okLabel: 'Reset', onOk: () => ctfTimerApi({ action: 'reset' }) });
    return;
  }
  ctfTimerApi({ action: 'reset' });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startCtfTimer);
else startCtfTimer();

function renderRegOpenBlock(open) {
  const closedLight = document.getElementById('dash-reg-light-closed');
  const openLight   = document.getElementById('dash-reg-light-open');
  const text        = document.getElementById('dash-reg-state-text');
  if (closedLight) closedLight.classList.toggle('active', !open);
  if (openLight)   openLight.classList.toggle('active', open);
  if (text) {
    text.textContent = open ? 'Open' : 'Closed';
    text.style.color = open ? '#22c55e' : '#ef4444';
  }
  // Also update toggle in CTF tab if present
  const toggle = document.getElementById('reg-open-toggle');
  if (toggle) toggle.checked = open;
  const toggleLabel = document.getElementById('reg-open-toggle-label');
  if (toggleLabel) {
    toggleLabel.textContent = open ? 'Open' : 'Closed';
    toggleLabel.style.color = open ? '#22c55e' : '#ef4444';
  }
  const panelClosed = document.getElementById('reg-panel-light-closed');
  const panelOpen = document.getElementById('reg-panel-light-open');
  if (panelClosed) panelClosed.classList.toggle('active', !open);
  if (panelOpen) panelOpen.classList.toggle('active', open);
}

async function loadRegOpen() {
  try {
    const res = await apiFetch('/api/admin/registration-open');
    const data = await res.json();
    renderRegOpenBlock(!!data.open);
  } catch {}
}

async function setRegOpen(open) {
  try {
    const res = await apiFetch('/api/admin/registration-open', { method: 'POST', body: JSON.stringify({ open }) });
    const data = await res.json();
    if (data.ok !== undefined) renderRegOpenBlock(!!data.open);
  } catch {}
}

// ── Leaderboard visibility for participants ──
function renderLeaderboardVisible(visible) {
  const hiddenLight = document.getElementById('lb-panel-light-hidden');
  const visibleLight = document.getElementById('lb-panel-light-visible');
  const label = document.getElementById('lb-visible-label');
  if (hiddenLight) hiddenLight.classList.toggle('active', !visible);
  if (visibleLight) visibleLight.classList.toggle('active', visible);
  if (label) { label.textContent = visible ? 'Visible' : 'Hidden'; label.style.color = visible ? '#22c55e' : '#ef4444'; }
}

async function loadLeaderboardVisible() {
  try {
    const res = await apiFetch('/api/challenges/leaderboard-visible');
    const data = await res.json();
    renderLeaderboardVisible(data.visible !== false);
  } catch {}
}

async function setLeaderboardVisible(visible) {
  try {
    const res = await apiFetch('/api/challenges/leaderboard-visible', { method: 'POST', body: JSON.stringify({ visible }) });
    const data = await res.json();
    if (data.ok !== undefined) renderLeaderboardVisible(!!data.visible);
  } catch {}
}

async function loadChallenges() {
  const res = await apiFetch('/api/challenges');
  const challenges = await res.json();
  _challengesCache = challenges;
  const tbody = document.getElementById('challenges-tbody');
  if (!challenges.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No challenges yet. Click "Add" to create one.</td></tr>`;
    return;
  }
  tbody.innerHTML = challenges.map((c, idx) => renderChallengeRow(c, idx, challenges.length)).join('');
  initChallengeDragDrop(tbody);
}

// Challenge types. The first three are event-based (verified against the AI
// Gateway event API) and share the same config fields; 'dlp' and 'ai_guardrails'
// currently behave like 'transaction_id'. 'text' matches a keyword instead.
const CHALLENGE_GROUPS = [
  { group: 'text',   label: 'Text',   types: [{ value: 'text', label: 'Text' }] },
  { group: 'policy', label: 'Policy', types: [
    { value: 'policy_access',      label: 'Access Control' },
    { value: 'policy_dlp',         label: 'DLP' },
    { value: 'policy_guardrails',  label: 'Guardrails' },
  ]},
  { group: 'events', label: 'Events', types: [
    { value: 'event_access',       label: 'Access Control' },
    { value: 'event_dlp',          label: 'DLP' },
    { value: 'event_guardrails',   label: 'Guardrails' },
  ]},
];
const CHALLENGE_TYPES = CHALLENGE_GROUPS.flatMap(g => g.types);
const _LEGACY_TYPE_MAP = { 'transaction_id': 'event_access', 'dlp': 'event_dlp', 'ai_guardrails': 'event_guardrails' };
function normalizeChallengeType(t) {
  if (_LEGACY_TYPE_MAP[t]) return _LEGACY_TYPE_MAP[t];
  return CHALLENGE_TYPES.some(x => x.value === t) ? t : 'event_access';
}
function challengeTypeLabel(t) {
  for (const g of CHALLENGE_GROUPS) {
    const found = g.types.find(x => x.value === t);
    if (found) return g.group === 'text' ? found.label : `${g.label} · ${found.label}`;
  }
  return t;
}
function typeToGroup(t) {
  if (t === 'text') return 'text';
  if (t.startsWith('policy_')) return 'policy';
  return 'events';
}
function challengeTypePayload(type) {
  const challenge_type = normalizeChallengeType(type);
  return {
    challenge_type,
    challenge_group: typeToGroup(challenge_type),
  };
}
function typeToTransactionType(t) {
  if (t.endsWith('_dlp')) return 'DLP';
  if (t.endsWith('_guardrails')) return 'Guardrails';
  if (t.endsWith('_access')) return 'Access';
  return null;
}
function isEventChallengeType(t) { return t !== 'text'; }
function renderTypePicker(activeType, getOnclick) {
  const meta = {
    text: { hint: 'Keyword match' },
    policy: { hint: 'Policy outcome' },
    events: { hint: 'Gateway event' },
  };
  const cards = CHALLENGE_GROUPS.map(g => {
    const activeInGroup = g.types.some(t => t.value === activeType);
    const options = g.types.map(t =>
      `<button type="button" class="challenge-type-btn${activeType === t.value ? ' active' : ''}" data-type="${t.value}" data-group="${g.group}" onclick="${getOnclick(t.value)}">${t.label}</button>`
    ).join('');
    return `
      <div class="challenge-type-card${activeInGroup ? ' is-active' : ''}" data-group="${g.group}">
        <div class="challenge-type-card-head">
          <div>
            <strong>${g.label}</strong>
            <span>${meta[g.group].hint}</span>
          </div>
        </div>
        <div class="challenge-type-options">${options}</div>
      </div>`;
  }).join('');
  return `<div class="challenge-type-toggle">${cards}</div>`;
}
function updateTypePickerActive(root, type) {
  if (!root) return;
  root.querySelectorAll('.challenge-type-btn[data-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  root.querySelectorAll('.challenge-type-card[data-group]').forEach(card => {
    card.classList.toggle('is-active', !!card.querySelector(`.challenge-type-btn[data-type="${type}"]`));
  });
}

function renderChallengeRow(c, idx = 0, total = 0, editing = false) {
  const type = normalizeChallengeType(c.challenge_type);
  const dragHandle = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.4;pointer-events:none;display:block;margin:auto;"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>`;
  const isVis = !!c.visible;
  const visibleToggle = `<button class="row-icon-btn ${isVis ? 'row-icon-btn--policy' : ''}" onclick="toggleChallengeVisible(${c.id}, ${isVis ? 0 : 1}, this)" id="ch-vis-btn-${c.id}" title="${isVis ? 'Visible to participants' : 'Hidden from participants'}" aria-label="${isVis ? 'Visible' : 'Hidden'}">${rowActionIcon(isVis ? 'visible' : 'hidden')}</button>`;

  const titleCell = editing
    ? `<input class="adm-inline-input" value="${escHtml(c.title)}" id="ch-title-${c.id}" placeholder="Challenge title">`
    : `<span class="challenge-summary-head">
        <span class="challenge-read-value challenge-summary-title" id="ch-title-${c.id}">${escHtml(c.title) || '<em style="color:var(--text-muted)">—</em>'}</span>
        <span id="ch-summary-type-${c.id}" class="challenge-type-badge challenge-type-badge--${typeToGroup(type)} challenge-summary-type">${challengeTypeLabel(type)}</span>
      </span>`;

  const descCell = editing
    ? `<textarea class="adm-inline-input challenge-description-input" rows="2" id="ch-desc-${c.id}" placeholder="What should the participant prove?">${escHtml(c.description)}</textarea>`
    : `<span class="challenge-read-value" id="ch-desc-${c.id}">${escHtml(c.description) || '<em style="color:var(--text-muted)">—</em>'}</span>`;

  const typeCell = editing
    ? `${renderTypePicker(type, v => `setChallengeEditType(${c.id},'${v}')`)}<input type="hidden" id="ch-ctype-${c.id}" value="${type}">`
    : `<span class="challenge-type-badge challenge-type-badge--${typeToGroup(type)}">${challengeTypeLabel(type)}</span>`;

  const activityOpts = ['Download','Others','Prompt','Upload'].map(v => `<option${c.ch_activity===v?' selected':''}>${escHtml(v)}</option>`).join('');
  const gwOpts = ['Monitor','Block','Replace'].map(v => `<option${c.ch_gateway_action===v?' selected':''}>${escHtml(v)}</option>`).join('');

  let configCell;
  if (editing) {
    configCell = `
      <div id="ch-config-tid-${c.id}" class="challenge-config-row" style="${type==='text'?'display:none':''}">
        <div class="challenge-config-group"><label class="challenge-config-label">Activity</label><select class="adm-inline-input challenge-config-select" id="ch-activity-${c.id}">${activityOpts}</select></div>
        <div class="challenge-config-group"><label class="challenge-config-label">Action</label><select class="adm-inline-input challenge-config-select" id="ch-gwaction-${c.id}">${gwOpts}</select></div>
        <div class="challenge-config-group"><label class="challenge-config-label">Model</label><input class="adm-inline-input challenge-config-select" id="ch-model-${c.id}" value="${escHtml(c.ch_model||'')}" placeholder="e.g. gpt-4o"></div>
      </div>
      <div id="ch-config-text-${c.id}" style="${type==='text'?'':'display:none'}">
        <input class="adm-inline-input" id="ch-textkey-${c.id}" value="${escHtml(c.ch_text_key||'')}" placeholder="Text the participant must send">
      </div>`;
  } else {
    if (isEventChallengeType(type)) {
      const txType = c.ch_transaction_type || typeToTransactionType(type);
      const parts = [c.ch_activity, c.ch_gateway_action, txType, c.ch_model].filter(Boolean);
      configCell = parts.length
        ? parts.map(p => `<span class="challenge-config-chip">${escHtml(p)}</span>`).join('')
        : `<em style="color:var(--text-muted)">—</em>`;
    } else {
      configCell = c.ch_text_key
        ? `<code class="challenge-text-key-value">${escHtml(c.ch_text_key)}</code>`
        : `<em style="color:var(--text-muted)">—</em>`;
    }
  }

  const timeCell = editing
    ? `<div id="ch-lookback-row-${c.id}" class="challenge-lookback-row" style="${type==='text'?'display:none':''}">
        <div class="challenge-time-input-wrap"><input class="adm-inline-input" type="number" min="10" max="60" value="${c.ns_time_filter}" id="ch-time-${c.id}" oninput="this.value=Math.min(60,Math.max(10,parseInt(this.value)||10))"><span>min</span></div>
      </div>
      <span id="ch-lookback-na-${c.id}" style="${type==='text'?'':'display:none'};color:var(--text-muted);font-size:13px">—</span>`
    : (isEventChallengeType(type)
        ? `<span class="challenge-read-value">${c.ns_time_filter} min</span>`
        : `<span style="color:var(--text-muted)">—</span>`);

  const editBtn = editing
    ? `<button class="row-icon-btn row-icon-btn--policy" onclick="saveChallengeEdit(${c.id})" title="Save" aria-label="Save">${rowActionIcon('save')}</button>`
    : `<button class="row-icon-btn row-icon-btn--policy" onclick="startChallengeEdit(${c.id})" title="Edit" aria-label="Edit">${rowActionIcon('edit')}</button>`;

  const pointsCell = editing
    ? `<input class="adm-inline-input ch-add-input--narrow" type="number" min="10" max="500" value="${c.ch_points || 50}" id="ch-points-${c.id}" style="width:70px;" oninput="this.value=Math.min(500,Math.max(10,parseInt(this.value)||10))">`
    : `<span class="challenge-read-value">${c.ch_points || 50} pts</span>`;

  const hintCell = editing
    ? `<input class="adm-inline-input" style="width:100%;max-width:400px;" placeholder="Optional hint text for participants" value="${escHtml(c.hint || '')}" id="ch-hint-${c.id}">`
    : (c.hint ? `<span class="challenge-read-value" style="color:var(--text-secondary)">${escHtml(c.hint)}</span>` : `<span style="color:var(--text-muted)">—</span>`);

  const chevronDown = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
  const chevronUp   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
  return `<tr id="ch-row-${c.id}" class="challenge-admin-row challenge-group-start" data-editing="${editing}" data-collapsed="true" draggable="true" data-id="${c.id}">
    <td id="ch-drag-${c.id}" class="drag-handle-cell" style="width:28px;text-align:center;color:var(--text-muted);cursor:grab;">${dragHandle}</td>
    <td id="ch-idcell-${c.id}" class="challenge-id-cell" rowspan="1" style="cursor:pointer;" onclick="toggleChallengeCollapse(${c.id})" title="Expand/collapse">
      <span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">
        <code id="ch-seq-${c.id}">#${idx + 1}</code>
        <span id="ch-chevron-${c.id}" style="color:var(--text-muted);line-height:1;">${chevronDown}</span>
      </span>
    </td>
    <td id="ch-titlelabel-${c.id}" class="challenge-label-cell" style="display:none;">Title</td>
    <td class="challenge-value-cell" colspan="2" ${!editing ? `onclick="toggleChallengeCollapse(${c.id})" style="cursor:pointer;"` : ''}>${titleCell}</td>
    <td id="ch-act2-${c.id}" class="challenge-action-cell" rowspan="1">${editBtn}</td>
    <td id="ch-act3-${c.id}" class="challenge-action-cell" rowspan="1">
      <button class="row-icon-btn row-icon-btn--danger" onclick="deleteChallenge(${c.id})" title="Delete challenge" aria-label="Delete challenge">${rowActionIcon('delete-student')}</button>
    </td>
    <td id="ch-act4-${c.id}" class="challenge-action-cell" rowspan="1">${visibleToggle}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Description</td>
    <td class="challenge-value-cell">${descCell}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Type</td>
    <td class="challenge-value-cell">${typeCell}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">${type === 'text' ? 'Text key <span class="info-icon-wrap"><svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span class="info-popover"><strong>Available variables</strong><span><code>%tokengroup</code> Token Group assigned to the student</span><span><code>%gateway_url</code> Gateway URL configured on Netskope tenant</span></span></span>' : 'Config'}</td>
    <td class="challenge-value-cell">${configCell}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Lookback</td>
    <td class="challenge-value-cell">${timeCell}</td>
  </tr>
  <tr class="challenge-admin-row ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Points</td>
    <td class="challenge-value-cell">${pointsCell}</td>
  </tr>
  <tr class="challenge-admin-row challenge-group-end ch-detail-${c.id}" style="display:none;">
    <td class="challenge-label-cell">Hint <span style="font-weight:400;color:var(--text-muted);font-size:11px">(-5 pts)</span></td>
    <td class="challenge-value-cell">${hintCell}</td>
  </tr>`;
}

function startChallengeEdit(id) {
  const row = document.getElementById(`ch-row-${id}`);
  if (!row) return;
  const tbody = row.closest('tbody');
  const allRows = [...tbody.querySelectorAll('tr[id^="ch-row-"]')];
  const idx = allRows.indexOf(row);
  const total = allRows.length;

  const challenges = _challengesCache || [];
  const c = challenges.find(x => x.id === id);
  if (!c) return;

  const html = renderChallengeRow(c, idx, total, true);
  const tmp = document.createElement('tbody');
  tmp.innerHTML = html;
  const newRows = [...tmp.children];

  const existingRows = [row];
  let next = row.nextElementSibling;
  while (next && !next.id.startsWith('ch-row-')) { existingRows.push(next); next = next.nextElementSibling; }

  existingRows.forEach((r, i) => { if (newRows[i]) r.replaceWith(newRows[i]); });
  // Auto-expand so all fields are visible while editing
  const newMainRow = document.getElementById(`ch-row-${id}`);
  if (newMainRow && newMainRow.dataset.collapsed === 'true') toggleChallengeCollapse(id);
}

async function saveChallengeEdit(id) {
  await updateChallenge(id);
}

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function updateChallenge(id) {
  const row = document.getElementById(`ch-row-${id}`);
  const section = row?.closest('tbody');
  const val = sel => { const el = section?.querySelector(sel); return el ? (el.value ?? el.textContent) : ''; };
  const cached = _challengesCache.find(c => c.id === id);
  const typePayload = challengeTypePayload(val(`#ch-ctype-${id}`) || cached?.challenge_type || 'event_access');
  const { challenge_type } = typePayload;
  const body = {
    title: val(`#ch-title-${id}`),
    description: val(`#ch-desc-${id}`),
    ns_time_filter: Math.min(60, Math.max(10, parseInt(val(`#ch-time-${id}`)) || 30)),
    ch_points: parseInt(val(`#ch-points-${id}`)) || 50,
    visible: (_challengesCache.find(c => c.id === id)?.visible ?? 1),
    ...typePayload,
    ch_activity: challenge_type !== 'text' ? val(`#ch-activity-${id}`) : null,
    ch_gateway_action: challenge_type !== 'text' ? val(`#ch-gwaction-${id}`) : null,
    ch_transaction_type: challenge_type !== 'text' ? typeToTransactionType(challenge_type) : null,
    ch_text_key: challenge_type === 'text' ? val(`#ch-textkey-${id}`) : null,
    ch_model: challenge_type !== 'text' ? (val(`#ch-model-${id}`) || null) : null,
    hint: val(`#ch-hint-${id}`) || null,
  };
  await apiFetch(`/api/challenges/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const idx = _challengesCache.findIndex(c => c.id === id);
  if (idx >= 0) _challengesCache[idx] = { ..._challengesCache[idx], ...body };
  loadChallenges();
  loadDashboard();
}

async function toggleChallengeVisible(id, nextVisible, btn) {
  const c = _challengesCache.find(x => x.id === id);
  if (!c) return;
  await apiFetch(`/api/challenges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...c, visible: nextVisible })
  });
  c.visible = nextVisible;
  const isVis = !!nextVisible;
  btn.className = `row-icon-btn${isVis ? ' row-icon-btn--policy' : ''}`;
  btn.title = isVis ? 'Visible to participants' : 'Hidden from participants';
  btn.innerHTML = rowActionIcon(isVis ? 'visible' : 'hidden');
  btn.onclick = () => toggleChallengeVisible(id, isVis ? 0 : 1, btn);
}

function initChallengeDragDrop(tbody) {
  let dragSrc = null;
  const mainRows = () => [...tbody.querySelectorAll('tr[id^="ch-row-"]')];
  const groupRows = id => [...tbody.querySelectorAll(`tr[id="ch-row-${id}"], tr.ch-detail-${id}`)];

  tbody.querySelectorAll('tr[draggable]').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = row;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => groupRows(row.dataset.id).forEach(r => r.style.opacity = '0.4'), 0);
    });
    row.addEventListener('dragend', () => {
      if (dragSrc) groupRows(dragSrc.dataset.id).forEach(r => r.style.opacity = '');
      dragSrc = null;
      mainRows().forEach(r => r.style.borderTop = '');
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      mainRows().forEach(r => r.style.borderTop = '');
      if (row !== dragSrc) row.style.borderTop = '2px solid var(--accent)';
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const mains = mainRows();
      const fromIdx = mains.indexOf(dragSrc);
      const toIdx = mains.indexOf(row);
      mains.splice(fromIdx, 1);
      mains.splice(toIdx, 0, dragSrc);
      mainRows().forEach(r => r.style.borderTop = '');
      // Reinsert groups in new order
      mains.forEach((mainRow, i) => {
        const id = mainRow.dataset.id;
        groupRows(id).forEach(r => tbody.appendChild(r));
        const el = document.getElementById(`ch-seq-${id}`);
        if (el) el.textContent = `#${i + 1}`;
      });
      const ids = mains.map(r => parseInt(r.dataset.id));
      await apiFetch('/api/challenges/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    });
  });
}

function toggleNewChallengeRow() {
  const tbody = document.getElementById('new-challenge-tbody');
  if (!tbody) return;
  if (tbody.innerHTML.trim()) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = `
    <tr class="challenge-admin-row challenge-group-start">
      <td rowspan="8" style="border:none;"></td>
      <td class="challenge-id-cell" rowspan="8" style="text-align:center;vertical-align:middle;color:var(--text-muted);font-size:12px;font-weight:600;">NEW</td>
      <td class="challenge-label-cell">Title</td>
      <td class="challenge-value-cell" colspan="1"><input class="adm-inline-input" id="new-ch-title" placeholder="Challenge title" style="width:100%;"></td>
      <td class="challenge-action-cell" rowspan="8" style="vertical-align:middle;"></td>
      <td class="challenge-action-cell" rowspan="8" style="vertical-align:middle;"></td>
      <td class="challenge-action-cell" rowspan="8" style="vertical-align:middle;"></td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Description</td>
      <td class="challenge-value-cell"><textarea class="adm-inline-input" id="new-ch-desc" placeholder="What should the participant prove?" rows="1" style="width:100%;resize:none;overflow:hidden;" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea></td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Type</td>
      <td class="challenge-value-cell">
        ${renderTypePicker('text', v => `setChallengeFormType('${v}')`)}
        <input type="hidden" id="new-ch-type" value="text">
      </td>
    </tr>
    <tr class="challenge-admin-row" id="ch-form-config-tid-row">
      <td class="challenge-label-cell">Config</td>
      <td class="challenge-value-cell">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select class="adm-inline-input" id="new-ch-activity" style="flex:1;min-width:100px;"><option>Download</option><option>Others</option><option>Prompt</option><option>Upload</option></select>
          <select class="adm-inline-input" id="new-ch-gwaction" style="flex:1;min-width:100px;"><option>Monitor</option><option>Block</option><option>Replace</option></select>
          <input class="adm-inline-input" id="new-ch-model" style="flex:1;min-width:100px;" placeholder="Model (e.g. gpt-4o)">
        </div>
      </td>
    </tr>
    <tr class="challenge-admin-row" id="ch-form-textkey-row" style="display:none;">
      <td class="challenge-label-cell">Text key <span class="info-icon-wrap"><svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span class="info-popover"><strong>Available variables</strong><span><code>%tokengroup</code> Token Group assigned to the student</span><span><code>%gateway_url</code> Gateway URL configured on Netskope tenant</span></span></span></td>
      <td class="challenge-value-cell"><input class="adm-inline-input" id="new-ch-textkey" placeholder="Text the participant must send (supports %gateway_url and %tokengroup variables)" style="width:100%;"></td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell" id="ch-form-score-label">Lookback / Points</td>
      <td class="challenge-value-cell">
        <div style="display:flex;gap:8px;align-items:center;">
          <span id="ch-form-lookback-control" style="display:inline-flex;gap:8px;align-items:center;">
            <input class="adm-inline-input" type="number" min="10" max="60" value="30" id="new-ch-time" style="width:65px;" oninput="this.value=Math.min(60,Math.max(10,parseInt(this.value)||10))">
            <span style="color:var(--text-muted);font-size:11px;">min</span>
          </span>
          <input class="adm-inline-input" type="number" min="10" max="500" value="50" id="new-ch-points" style="width:65px;" oninput="this.value=Math.min(500,Math.max(10,parseInt(this.value)||10))">
          <span style="color:var(--text-muted);font-size:11px;">pts</span>
        </div>
      </td>
    </tr>
    <tr class="challenge-admin-row">
      <td class="challenge-label-cell">Hint <span style="font-weight:400;color:var(--text-muted);font-size:11px">(-5 pts)</span></td>
      <td class="challenge-value-cell"><textarea class="adm-inline-input" id="new-ch-hint" placeholder="Optional hint text for participants" rows="1" style="width:100%;resize:none;overflow:hidden;" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea></td>
    </tr>
    <tr class="challenge-admin-row challenge-group-end">
      <td colspan="2" style="padding:10px 12px;text-align:right;border-top:1px solid var(--border);">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-secondary" onclick="toggleNewChallengeRow()" style="padding:6px 0;font-size:12px;width:80px;">Cancel</button>
          <button class="btn-primary" onclick="addChallenge()" style="padding:6px 0;font-size:12px;width:80px;">Create</button>
        </div>
      </td>
  </tr>`;
  setTimeout(() => setChallengeFormType('text'), 0);
  document.getElementById('new-ch-title')?.focus();
}

function toggleChallengeCollapse(id) {
  const row = document.getElementById(`ch-row-${id}`);
  if (!row) return;
  const collapsed = row.dataset.collapsed === 'true';
  const details = document.querySelectorAll(`.ch-detail-${id}`);
  const chevron = document.getElementById(`ch-chevron-${id}`);
  const chevronDown = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
  const chevronUp   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
  const span = collapsed ? 7 : 1;
  ['ch-drag', 'ch-idcell', 'ch-act2', 'ch-act3', 'ch-act4'].forEach(prefix => {
    const el = document.getElementById(`${prefix}-${id}`);
    if (el) el.rowSpan = span;
  });
  const labelCell = document.getElementById(`ch-titlelabel-${id}`);
  const titleRow = row.querySelector('.challenge-value-cell');
  const summaryType = document.getElementById(`ch-summary-type-${id}`);
  if (collapsed) {
    details.forEach(r => r.style.display = '');
    row.dataset.collapsed = 'false';
    if (chevron) chevron.innerHTML = chevronUp;
    if (labelCell) labelCell.style.display = '';
    if (titleRow) titleRow.colSpan = 1;
    if (summaryType) summaryType.style.display = 'none';
  } else {
    details.forEach(r => r.style.display = 'none');
    row.dataset.collapsed = 'true';
    if (chevron) chevron.innerHTML = chevronDown;
    if (labelCell) labelCell.style.display = 'none';
    if (titleRow) titleRow.colSpan = 2;
    if (summaryType) summaryType.style.display = '';
  }
}

function expandAllChallenges() {
  document.querySelectorAll('.challenge-group-start[data-collapsed="true"]').forEach(row => {
    const id = row.id.replace('ch-row-', '');
    toggleChallengeCollapse(id);
  });
}

function collapseAllChallenges() {
  document.querySelectorAll('.challenge-group-start[data-collapsed="false"]').forEach(row => {
    const id = row.id.replace('ch-row-', '');
    toggleChallengeCollapse(id);
  });
}

async function addChallenge() {
  const title = document.getElementById('new-ch-title')?.value.trim() || 'New challenge';
  const description = document.getElementById('new-ch-desc')?.value.trim() || '';
  const typePayload = challengeTypePayload(document.getElementById('new-ch-type')?.value || 'event_access');
  const { challenge_type } = typePayload;
  const ns_time_filter = Math.min(60, Math.max(10, parseInt(document.getElementById('new-ch-time')?.value, 10) || 30));
  const ch_points = parseInt(document.getElementById('new-ch-points')?.value, 10) || 50;
  const hint = document.getElementById('new-ch-hint')?.value.trim() || null;
  const body = {
    title, description, ...typePayload, visible: 0, ns_time_filter, ch_points, hint,
    ch_activity: challenge_type !== 'text' ? document.getElementById('new-ch-activity')?.value : null,
    ch_gateway_action: challenge_type !== 'text' ? document.getElementById('new-ch-gwaction')?.value : null,
    ch_transaction_type: challenge_type !== 'text' ? typeToTransactionType(challenge_type) : null,
    ch_text_key: challenge_type === 'text' ? document.getElementById('new-ch-textkey')?.value.trim() : null,
    ch_model: challenge_type !== 'text' ? (document.getElementById('new-ch-model')?.value.trim() || null) : null,
  };
  const res = await apiFetch('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (d.id) {
    const tbody = document.getElementById('new-challenge-tbody');
    if (tbody) tbody.innerHTML = '';
    loadChallenges();
    loadDashboard();
  }
}

function setChallengeFormType(type) {
  const typeInput = document.getElementById('new-ch-type');
  if (typeInput) typeInput.value = type;
  updateTypePickerActive(document.getElementById('new-challenge-tbody'), type);
  const tidRow = document.getElementById('ch-form-config-tid-row');
  const textRow = document.getElementById('ch-form-textkey-row');
  const scoreLabel = document.getElementById('ch-form-score-label');
  const lookbackControl = document.getElementById('ch-form-lookback-control');
  if (tidRow) tidRow.style.display = type === 'text' ? 'none' : '';
  if (textRow) textRow.style.display = type === 'text' ? '' : 'none';
  if (scoreLabel) scoreLabel.textContent = type === 'text' ? 'Points' : 'Lookback / Points';
  if (lookbackControl) lookbackControl.style.display = type === 'text' ? 'none' : 'inline-flex';
}

function setChallengeEditType(id, type) {
  document.getElementById(`ch-ctype-${id}`).value = type;
  const row = document.getElementById(`ch-row-${id}`);
  const picker = row?.querySelector('.challenge-type-toggle') || row?.closest('tbody')?.querySelector(`.ch-detail-${id} .challenge-type-toggle`);
  updateTypePickerActive(picker, type);
  const tidDiv = document.getElementById(`ch-config-tid-${id}`);
  const textDiv = document.getElementById(`ch-config-text-${id}`);
  const lookbackRow = document.getElementById(`ch-lookback-row-${id}`);
  const lookbackNa = document.getElementById(`ch-lookback-na-${id}`);
  if (tidDiv) tidDiv.style.display = type === 'text' ? 'none' : '';
  if (textDiv) textDiv.style.display = type === 'text' ? '' : 'none';
  if (lookbackRow) lookbackRow.style.display = type === 'text' ? 'none' : '';
  if (lookbackNa) lookbackNa.style.display = type === 'text' ? '' : 'none';
}

async function deleteChallenge(id) {
  showConfirm({ title: 'Delete challenge', body: 'This will also remove all participant completions for this challenge.', onOk: async () => {
    await apiFetch(`/api/challenges/${id}`, { method: 'DELETE' });
    loadChallenges();
    loadDashboard();
    loadAdminCodes();
  }});
}

async function toggleAllChallengesVisible() {
  const challenges = Array.isArray(_challengesCache) ? _challengesCache : [];
  if (!challenges.length) return;
  const allVisible = challenges.every(c => !!c.visible);
  const nextVisible = allVisible ? 0 : 1;
  const btn = document.getElementById('challenge-toggle-all-btn');
  if (btn) { btn.disabled = true; }
  try {
    await Promise.all(challenges.map(c => apiFetch(`/api/challenges/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, visible: nextVisible })
    })));
    challenges.forEach(c => { c.visible = nextVisible; });
    loadChallenges();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAllChallenges() {
  showConfirm({ title: 'Delete all challenges', body: 'This will delete all challenges and all participant completion records.', onOk: async () => {
    await apiFetch('/api/challenges/all', { method: 'DELETE' });
    loadChallenges();
    loadDashboard();
    loadAdminCodes();
  }});
}

async function exportChallengesCSV() {
  const res = await apiFetch('/api/challenges/export');
  const text = await res.text();
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(text);
  a.download = 'challenges.csv';
  a.click();
}

async function importChallengesCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const csv = await file.text();
  const res = await apiFetch('/api/challenges/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
  const d = await res.json();
  event.target.value = '';
  if (d.ok) { showAlert('Import complete', `Imported ${d.imported} challenge(s).`); loadChallenges(); }
  else showAlert('Import error', d.error || 'Unknown error');
}

// ── Student: Challenges panel ─────────────────────────────

let participantChallenges = [];
let challengesPanelOpen = false;

async function openChallengesPanel() {
  const panel = document.getElementById('challenges-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); challengesPanelOpen = false; return; }
  panel.classList.add('open');
  challengesPanelOpen = true;
  showChallengeTab('list');
  await loadParticipantChallenges();
}

function closeChallengesPanel() {
  document.getElementById('challenges-panel')?.classList.remove('open');
  challengesPanelOpen = false;
}

function showChallengeTab(tab) {
  document.getElementById('chtab-panel-list').style.display = tab === 'list' ? '' : 'none';
  document.getElementById('chtab-panel-history').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('chtab-panel-scoring').style.display = tab === 'scoring' ? '' : 'none';
  const sep = 'border-right:1px solid var(--border);';
  const active = `flex:1;padding:8px;font-size:12px;border:none;background:var(--accent-bg);color:var(--accent);font-weight:600;cursor:pointer;`;
  const inactive = `flex:1;padding:8px;font-size:12px;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;`;
  document.getElementById('chtab-list').style.cssText = (tab === 'list' ? active : inactive) + sep;
  document.getElementById('chtab-history').style.cssText = (tab === 'history' ? active : inactive) + sep;
  document.getElementById('chtab-scoring').style.cssText = tab === 'scoring' ? active : inactive;
  if (tab === 'history') loadParticipantChallengeHistory();
}

async function loadParticipantChallengeHistory() {
  const el = document.getElementById('participant-challenge-history');
  if (!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">Loading...</div>';
  try {
    const res = await apiFetch('/api/challenges/participant/history');
    const { history, total_points, completed, total, hints_used, failed_attempts } = await res.json();

    // Score strip
    const scoreStrip = `
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value">${total_points}</div>
          <div class="ctf-sidebar-score-label">Total pts</div>
        </div>
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value">${completed}/${total}</div>
          <div class="ctf-sidebar-score-label">Done</div>
        </div>
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value" style="color:#f59e0b;">${hints_used}</div>
          <div class="ctf-sidebar-score-label">Hints used</div>
        </div>
        <div class="ctf-sidebar-score-item">
          <div class="ctf-sidebar-score-value" style="color:#ef4444;">${failed_attempts}</div>
          <div class="ctf-sidebar-score-label">Penalties</div>
        </div>
      </div>`;

    if (!history.length) {
      el.innerHTML = scoreStrip + '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">No activity yet.</div>';
      return;
    }

    const timelineItems = history.map(h => {
      const dt = new Date(h.ts + (h.ts.includes('Z') ? '' : 'Z'));
      const formatted = dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      let dotClass, iconSvg, ptsText, ptsColor, eventLabel;
      if (h.result === 'success') {
        dotClass   = 'ctf-sidebar-tl-dot--success';
        iconSvg    = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        ptsText    = `+${h.points_earned} pts`;
        ptsColor   = '#22c55e';
        eventLabel = 'Completed';
      } else if (h.result === 'hint') {
        dotClass   = 'ctf-sidebar-tl-dot--hint';
        iconSvg    = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        ptsText    = '−5 pts';
        ptsColor   = '#f59e0b';
        eventLabel = 'Hint used';
      } else {
        dotClass   = 'ctf-sidebar-tl-dot--fail';
        iconSvg    = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        ptsText    = '−5 pts';
        ptsColor   = '#ef4444';
        eventLabel = 'Failed attempt';
      }
      return `<div class="ctf-sidebar-tl-item">
        <div class="ctf-sidebar-tl-dot ${dotClass}">${iconSvg}</div>
        <div class="ctf-sidebar-tl-body">
          <div class="ctf-sidebar-tl-title">#${h.order_num} ${escHtml(h.title)}</div>
          <div class="ctf-sidebar-tl-meta">${eventLabel} · ${formatted}</div>
        </div>
        <div class="ctf-sidebar-tl-pts" style="color:${ptsColor};">${ptsText}</div>
      </div>`;
    }).join('');

    el.innerHTML = scoreStrip + `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:8px;">Activity timeline</div>` + timelineItems;
  } catch {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);">Failed to load history.</div>';
  }
}

function openLeaderboardPanel() {
  const panel = document.getElementById('leaderboard-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  panel.classList.add('open');
  loadChallengesLeaderboard();
}

function closeLeaderboardPanel() {
  document.getElementById('leaderboard-panel')?.classList.remove('open');
}

let participantTotalPoints = 0;
let participantAttemptCount = 0;

let _ctfState = 'stop';

async function loadParticipantChallenges() {
  const list = document.getElementById('challenges-list');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">Loading...</div>';
  try {
    const res = await apiFetch('/api/challenges/participant');
    const data = await res.json();
    _ctfState = data.ctf_state || 'stop';
    participantChallenges = data.challenges || data;
    participantTotalPoints = data.total_points ?? 0;
    participantAttemptCount = data.attempt_count ?? 0;
    renderCTFStateButtons(_ctfState);
    renderCTFStateBanner();
    renderParticipantChallenges();
    updateChatInputState();
  } catch (e) {
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Failed to load challenges.</div>';
  }
}

function renderCTFStateBanner() {
  // Banner removed — semaphore in panel header is sufficient
  document.getElementById('ctf-state-banner')?.remove();
}

function updateChatInputState() {
  const timerExpired = _timer && _timer.hasData && _timer.total > 0 && _timer.remaining <= 0;
  const canSend = _ctfState === 'run' && !timerExpired;
  const input = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');
  const notice = document.getElementById('ctf-chat-notice');

  if (input) {
    input.disabled = !canSend;
    input.placeholder = canSend
      ? 'Ask me anything...'
      : timerExpired
        ? 'Time is up — the CTF has ended.'
        : (_ctfState === 'standby' ? 'Chat is in standby — waiting for the CTF to start.' : 'Chat is disabled — CTF has not started.');
  }
  if (sendBtn && !isSending) sendBtn.disabled = !canSend;
  if (notice) {
    notice.style.display = canSend ? 'none' : '';
    notice.textContent = timerExpired
      ? 'Time is up — the CTF has ended. Chat is disabled.'
      : (_ctfState === 'standby'
        ? 'The CTF is in standby — you can browse challenges but cannot send prompts yet.'
        : 'The CTF has not started yet. Chat is disabled.');
  }
}

function confirmUseHint(challengeId) {
  showConfirm({
    title: 'Use hint?',
    subtitle: 'This action cannot be undone',
    body: 'Using this hint will cost you -5 points. This action cannot be undone.',
    okLabel: 'Use hint (-5 pts)',
    onOk: () => useHint(challengeId),
  });
}

async function useHint(challengeId) {
  try {
    const res = await apiFetch(`/api/challenges/participant/${challengeId}/hint`, { method: 'POST' });
    const data = await res.json();
    if (data.hint) {
      // Update local cache
      const c = participantChallenges.find(x => x.id === challengeId);
      if (c) { c.hint_used = true; c.hint_text = data.hint; }
      // Show hint in card without full re-render
      const revealEl = document.getElementById(`ch-hint-reveal-${challengeId}`);
      const textEl = document.getElementById(`ch-hint-text-${challengeId}`);
      if (textEl) textEl.textContent = data.hint;
      if (revealEl) revealEl.style.display = '';
      // Replace "Use hint" button with "Hint used"
      const btn = document.querySelector(`button[onclick="confirmUseHint(${challengeId})"]`);
      if (btn) {
        btn.textContent = 'Hint used';
        btn.disabled = true;
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text-muted)';
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.6';
        btn.removeAttribute('onclick');
      }
      // Refresh score
      loadParticipantChallenges();
    }
  } catch {}
}

function renderParticipantChallenges() {
  const list = document.getElementById('challenges-list');
  if (!list) return;
  if (_ctfState === 'stop') {
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">The CTF has not started yet.</div>';
    updateChallengesProgressBar();
    return;
  }
  if (!participantChallenges.length) {
    list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">No challenges available yet.</div>';
    updateChallengesProgressBar();
    return;
  }

  const completed = participantChallenges.filter(c => c.completed).length;
  const total = participantChallenges.length;

  list.innerHTML = participantChallenges.map(c => {
    const pts = c.ch_points || 50;
    const isCompleted = c.completed;
    const isLocked = c.locked;

    // Card hierarchy: pending = prominent (accent left border), locked = red warning, completed = muted/recessed
    const badgeContent = isCompleted
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : isLocked
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        : `<span style="font-size:11px;color:#fff;font-weight:700;">${c.order_num}</span>`;

    // Completed = green gradient (same as Control Center "run" semaphore); pending = left accent stripe; locked = red warning
    const cardStyle = isCompleted
      ? 'border:1px solid rgba(22,163,74,.5);border-radius:10px;padding:9px 14px;background:linear-gradient(120deg,rgba(22,163,74,.10),transparent 70%);position:relative;'
      : isLocked
        ? 'border:1px solid rgba(239,68,68,0.4);border-radius:10px;padding:11px 14px;background:rgba(239,68,68,0.04);position:relative;'
        : 'border:1px solid rgba(0,102,255,.5);border-radius:10px;padding:11px 14px;background:var(--bg-secondary);position:relative;';

    // Points badge: green for completed, normal for others
    const ptsLabel = isCompleted
      ? `<span style="font-size:11px;font-weight:700;color:#16a34a;background:rgba(22,163,74,.12);border:1px solid rgba(22,163,74,.4);padding:2px 7px;border-radius:10px;">+${c.points_earned ?? pts} pts ✓</span>`
      : `<span style="font-size:11px;font-weight:600;color:var(--text-secondary);background:var(--bg-primary);border:1px solid var(--border);padding:2px 7px;border-radius:10px;">${pts} pts</span>`;

    const labelColor = isCompleted ? '#16a34a' : isLocked ? '#ef4444' : 'var(--text-muted)';
    const titleColor = isCompleted ? '#15803d' : isLocked ? 'var(--text-muted)' : 'var(--text-primary)';
    const titleWeight = isCompleted ? '600' : '700';

    return `
    <div class="challenge-card ${isCompleted ? 'completed' : isLocked ? 'locked' : ''}" id="challenge-card-${c.id}" style="${cardStyle}transition:border-color 0.2s;">
      <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;">
            <span style="font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${labelColor};">Challenge #${c.order_num}${isCompleted ? ' ✓' : isLocked ? ' 🔒' : ''}</span>
            ${ptsLabel}
          </div>
          <div style="font-size:${isCompleted ? '13px' : '14px'};font-weight:${titleWeight};color:${titleColor};margin-bottom:${isCompleted ? '0' : '4px'};">${escHtml(c.title)}</div>
          ${c.description && !isCompleted ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.4;margin-bottom:7px;">${escHtml(c.description)}</div>` : ''}
          ${isCompleted
            ? ``
            : isLocked
              ? `<div id="ch-cooldown-${c.id}" data-until="${c.cooldown_until || ''}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#ef4444;background:rgba(239,68,68,0.08);padding:3px 8px;border-radius:6px;">⏳ Too many failed attempts — cooldown active</div>`
              : `${c.challenge_type === 'text' ? `<input id="ch-text-input-${c.id}" type="text" placeholder="Type your answer…" style="margin-bottom:7px;width:100%;box-sizing:border-box;padding:5px 9px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);outline:none;" onkeydown="if(event.key==='Enter'){document.getElementById('ch-check-btn-${c.id}').click();}" />` : ''}
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <button id="ch-check-btn-${c.id}" onclick="checkChallenge(${c.id}, this)" ${_ctfState !== 'run' ? 'disabled' : ''} style="padding:4px 12px;font-size:12px;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:6px;cursor:pointer;font-weight:600;${_ctfState !== 'run' ? 'opacity:0.4;cursor:not-allowed;' : ''}">Check</button>
                  ${c.retries_left !== null ? `<span style="font-size:11px;color:${c.retries_left <= 1 ? '#ef4444' : 'var(--text-secondary)'};">${c.retries_left} ${c.retries_left === 1 ? 'retry' : 'retries'} left</span>` : ''}
                  <span class="challenge-penalty-msg" style="display:none;font-size:11px;color:#ef4444;">Not found — -5 pts</span>
                </div>
                ${c.has_hint ? (c.hint_used
                  ? `<button disabled style="padding:4px 12px;font-size:12px;border:1px solid var(--border);background:transparent;color:var(--text-muted);border-radius:6px;cursor:not-allowed;opacity:0.6;">Hint used</button>`
                  : _ctfState !== 'run'
                    ? `<button disabled style="padding:4px 12px;font-size:12px;border:1px solid #f59e0b;background:transparent;color:#f59e0b;border-radius:6px;cursor:not-allowed;opacity:0.4;font-weight:600;">Use hint</button>`
                    : `<button onclick="confirmUseHint(${c.id})" style="padding:4px 12px;font-size:12px;border:1px solid #f59e0b;background:transparent;color:#f59e0b;border-radius:6px;cursor:pointer;font-weight:600;">Use hint</button>`
                ) : ''}
              </div>
              ${c.hint_used ? `<div id="ch-hint-reveal-${c.id}" style="margin-top:7px;padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:12px;color:var(--text-secondary);"><strong style="color:#f59e0b;">Hint:</strong> <span id="ch-hint-text-${c.id}">${escHtml(c.hint || '')}</span></div>` : `<div id="ch-hint-reveal-${c.id}" style="display:none;margin-top:7px;padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:12px;color:var(--text-secondary);"><strong style="color:#f59e0b;">Hint:</strong> <span id="ch-hint-text-${c.id}"></span></div>`}`
          }
      </div>
    </div>`;
  }).join('');

  updateChallengesProgressBar(completed, total);
  startCooldownTickers();
}

let _cooldownTickerInterval = null;
function startCooldownTickers() {
  if (_cooldownTickerInterval) clearInterval(_cooldownTickerInterval);
  const tick = () => {
    const els = document.querySelectorAll('[id^="ch-cooldown-"][data-until]');
    if (!els.length) { clearInterval(_cooldownTickerInterval); _cooldownTickerInterval = null; return; }
    let anyActive = false;
    els.forEach(el => {
      const until = new Date(el.dataset.until).getTime();
      const remaining = until - Date.now();
      if (remaining <= 0) {
        // Cooldown expired — reload challenges
        clearInterval(_cooldownTickerInterval);
        _cooldownTickerInterval = null;
        loadParticipantChallenges();
      } else {
        anyActive = true;
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        el.textContent = `⏳ Cooldown: ${mins}:${String(secs).padStart(2, '0')} remaining`;
      }
    });
    if (!anyActive) { clearInterval(_cooldownTickerInterval); _cooldownTickerInterval = null; }
  };
  tick();
  _cooldownTickerInterval = setInterval(tick, 1000);
}

function updateChallengesProgressBar(completed, total) {
  const bar = document.getElementById('challenges-progress-bar');
  if (!bar) return;
  if (total === undefined) {
    completed = participantChallenges.filter(c => c.completed).length;
    total = participantChallenges.length;
  }
  if (total === 0) { bar.innerHTML = ''; return; }
  const pct = Math.round((completed / total) * 100);
  const penaltyLine = participantAttemptCount > 0
    ? `<span style="color:#ef4444;">−${participantAttemptCount * 5} pts penalties</span>`
    : '';
  bar.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-secondary);margin-bottom:6px;">
      <span>${completed}/${total} completed</span>
      <span style="display:flex;align-items:center;gap:8px;">
        ${penaltyLine}
        <span style="font-size:13px;font-weight:700;color:var(--accent);">${participantTotalPoints} pts</span>
      </span>
    </div>
    <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width 0.4s ease;"></div>
    </div>
  `;
}

async function checkChallenge(id, btn) {
  btn.disabled = true;
  btn.textContent = 'Checking...';
  const textInput = document.getElementById(`ch-text-input-${id}`);
  const participant_text = textInput ? textInput.value.trim() : undefined;
  try {
    const res = await apiFetch(`/api/challenges/participant/${id}/check`, {
      method: 'POST',
      body: JSON.stringify({ participant_text })
    });
    const d = await res.json();
    if (res.status === 403 && d.error === 'ctf_not_running') {
      await loadParticipantChallenges();
      return;
    }
    if (res.status === 429) {
      await loadParticipantChallenges();
      return;
    }
    if (d.found) {
      const idx = participantChallenges.findIndex(c => c.id === id);
      if (idx >= 0) {
        participantChallenges[idx].completed = true;
        participantChallenges[idx].points_earned = d.points_earned ?? participantChallenges[idx].ch_points ?? 50;
        participantChallenges[idx].locked = false;
        participantChallenges[idx].retries_left = null;
        participantTotalPoints += participantChallenges[idx].points_earned;
      }
      renderParticipantChallenges();
      launchFireworks();
    } else {
      participantAttemptCount++;
      participantTotalPoints -= 5;
      // Update retries_left in local cache
      const idx = participantChallenges.findIndex(c => c.id === id);
      if (idx >= 0) {
        if (d.retries_left !== undefined && d.retries_left !== null) {
          participantChallenges[idx].retries_left = d.retries_left;
          participantChallenges[idx].locked = d.retries_left === 0;
          participantChallenges[idx].cooldown_until = d.cooldown_until || null;
        }
      }
      if (d.retries_left === 0) {
        renderParticipantChallenges();
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Check';
      // Update retries counter in DOM if visible
      if (idx >= 0 && participantChallenges[idx].retries_left !== null) {
        renderParticipantChallenges();
        return;
      }
      updateChallengesProgressBar();
      const card = document.getElementById(`challenge-card-${id}`);
      if (card) {
        card.style.borderColor = '#ef4444';
        const penaltyMsg = card.querySelector('.challenge-penalty-msg');
        if (penaltyMsg) penaltyMsg.style.display = 'inline';
        setTimeout(() => {
          card.style.borderColor = 'var(--border)';
          if (penaltyMsg) penaltyMsg.style.display = 'none';
        }, 3000);
      }
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Check';
  }
}

async function loadChallengesLeaderboard() {
  const el = document.getElementById('challenges-leaderboard');
  if (!el) return;
  el.innerHTML = '<div class="lb-c-empty">Loading...</div>';
  try {
    const res = await apiFetch('/api/challenges/leaderboard');
    const { total, rows } = await res.json();
    el.innerHTML = _renderLeaderboardC(rows, total, userInfo?.code);
  } catch {
    el.innerHTML = '<div class="lb-c-empty">Failed to load leaderboard.</div>';
  }
}

function launchFireworks() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#ec4899','#06b6d4'];

  const totalFrames = 280;
  const burstSchedule = [0, 30, 60, 100, 140, 180, 220];

  function addBurst() {
    const x = canvas.width * 0.1 + Math.random() * canvas.width * 0.8;
    const y = canvas.height * 0.15 + Math.random() * canvas.height * 0.45;
    for (let i = 0; i < 70; i++) {
      const angle = (Math.PI * 2 * i) / 70;
      const speed = 3 + Math.random() * 6;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: colors[Math.floor(Math.random() * colors.length)], size: 3 + Math.random() * 3 });
    }
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (burstSchedule.includes(frame)) addBurst();
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.10;
      p.vx *= 0.99;
      p.alpha -= 0.008;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    frame++;
    if (frame < totalFrames) requestAnimationFrame(animate);
    else { canvas.remove(); }
  }
  animate();
}

// ── Wizard: Update step ───────────────────────────────────
async function wizCheckUpdate() {
  const btn = document.getElementById('wiz-check-update-btn');
  const msg = document.getElementById('wiz-update-msg');
  const updateBtn = document.getElementById('wiz-apply-update-btn');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  msg.className = 'wizard-msg';
  msg.textContent = '';
  try {
    const res = await apiFetch('/api/admin/update/check');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.upToDate) {
      msg.className = 'wizard-msg ok';
      msg.textContent = `✓ Already up to date (${data.local})`;
      updateBtn.style.display = 'none';
    } else {
      msg.className = 'wizard-msg';
      msg.style.color = '#f59e0b';
      msg.textContent = `Update available: ${data.remote} (current: ${data.local})`;
      updateBtn.style.display = '';
    }
  } catch (e) {
    msg.className = 'wizard-msg err';
    msg.textContent = `Error: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Check for updates';
  }
}

async function wizApplyUpdate() {
  const btn = document.getElementById('wiz-apply-update-btn');
  const checkBtn = document.getElementById('wiz-check-update-btn');
  const msg = document.getElementById('wiz-update-msg');
  btn.style.display = 'none';
  checkBtn.disabled = true;
  msg.className = 'wizard-msg';
  msg.style.color = 'var(--text-secondary)';
  msg.textContent = 'Applying update…';
  try {
    await apiFetch('/api/admin/update/apply', { method: 'POST' });
  } catch { /* server may close before responding */ }
  msg.textContent = 'Server is restarting…';
  const MAX_WAIT = 60;
  let elapsed = 0;
  const poll = setInterval(async () => {
    elapsed += 2;
    msg.textContent = `Server is restarting… (${elapsed}s)`;
    try {
      const r = await fetch('/api/health');
      if (r.ok) {
        clearInterval(poll);
        msg.className = 'wizard-msg ok';
        msg.textContent = '✓ Server updated — reloading…';
        setTimeout(() => location.reload(), 800);
      }
    } catch { /* still down */ }
    if (elapsed >= MAX_WAIT) {
      clearInterval(poll);
      msg.className = 'wizard-msg err';
      msg.textContent = `Server did not restart after ${MAX_WAIT}s — run ./update.sh manually.`;
      checkBtn.disabled = false;
    }
  }, 2000);
}

// ── Changelog ─────────────────────────────────────────────
async function openChangelog() {
  document.getElementById('changelog-modal').style.display = 'flex';
  const body = document.getElementById('changelog-body');
  body.innerHTML = '<span style="color:var(--text-secondary);">Loading…</span>';
  try {
    const res = await apiFetch('/api/admin/changelog');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Parse markdown into simple HTML
    const html = data.content
      .split('\n')
      .map(line => {
        if (line.startsWith('## ')) return `<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin:16px 0 6px;">${line.slice(3)}</div>`;
        if (line.startsWith('# ')) return '';
        if (line.startsWith('- ')) return `<div style="padding:2px 0 2px 12px;border-left:2px solid var(--border);">${line.slice(2)}</div>`;
        if (line.trim() === '') return '';
        return `<div>${line}</div>`;
      })
      .join('');
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<span style="color:#ef4444;">Error: ${e.message}</span>`;
  }
}

// ── About / Update ────────────────────────────────────────
async function loadAboutVersion() {
  const el = document.getElementById('about-version-local');
  const msg = document.getElementById('about-update-msg');
  const updateBtn = document.getElementById('about-update-btn');
  if (!el) return;
  try {
    const res = await apiFetch('/api/admin/update/version');
    const data = res.ok ? await res.json() : null;
    el.textContent = data?.local || 'unknown';
    if (updateBtn) updateBtn.style.display = 'none';
    if (msg) {
      msg.className = 'about-update-msg';
      msg.textContent = '';
    }
  } catch { el.textContent = 'unknown'; }
}

async function checkForUpdates() {
  const btn = document.getElementById('about-check-btn');
  const msg = document.getElementById('about-update-msg');
  const updateBtn = document.getElementById('about-update-btn');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  msg.className = 'about-update-msg';
  msg.textContent = '';
  try {
    const res = await apiFetch('/api/admin/update/check');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    document.getElementById('about-version-local').textContent = data.local;
    if (data.upToDate) {
      msg.className = 'about-update-msg about-update-msg--ok';
      msg.textContent = '✓ Already up to date.';
      updateBtn.style.display = 'none';
    } else {
      msg.className = 'about-update-msg about-update-msg--warn';
      msg.textContent = `Update available: ${data.remote}`;
      updateBtn.style.display = '';
    }
  } catch (e) {
    msg.className = 'about-update-msg about-update-msg--error';
    msg.textContent = `Error: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Check for updates';
  }
}

async function applyUpdate() {
  showConfirm({
    title: 'Apply update',
    subtitle: 'The server will restart automatically',
    body: 'The app will pull the latest changes from GitHub, install dependencies, and restart. This takes about 30 seconds. The page will reload automatically when the server is back.',
    okLabel: 'Update & restart',
    onOk: async () => {
      const btn = document.getElementById('about-update-btn');
      const checkBtn = document.getElementById('about-check-btn');
      const msg = document.getElementById('about-update-msg');
      btn.style.display = 'none';
      if (checkBtn) checkBtn.disabled = true;
      msg.className = 'about-update-msg about-update-msg--info';
      msg.textContent = 'Pulling latest changes…';
      try {
        await apiFetch('/api/admin/update/apply', { method: 'POST' });
      } catch { /* server may close connection before responding */ }

      // Poll until server is back, then reload
      msg.textContent = 'Server is restarting…';
      const MAX_WAIT = 60;
      let elapsed = 0;
      const poll = setInterval(async () => {
        elapsed += 2;
        msg.textContent = `Server is restarting… (${elapsed}s)`;
        try {
          const r = await fetch('/api/health');
          if (r.ok) {
            clearInterval(poll);
            msg.style.color = 'var(--accent)';
            msg.textContent = '✓ Server back online — reloading…';
            setTimeout(() => location.reload(), 800);
          }
        } catch { /* still down, keep polling */ }
        if (elapsed >= MAX_WAIT) {
          clearInterval(poll);
          msg.style.color = '#ef4444';
          msg.textContent = `Server did not restart after ${MAX_WAIT}s — run ./update.sh manually in terminal.`;
          if (checkBtn) checkBtn.disabled = false;
        }
      }, 2000);
    }
  });
}
