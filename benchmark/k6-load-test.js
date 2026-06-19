/**
 * k6 Load Test — ntsk-ai-gw-workshop-ctf
 *
 * REALISTIC PROFILE (v2):
 *   Each participant logs in / registers ONCE on its first iteration and then
 *   REUSES the JWT for every subsequent iteration — exactly how the real app
 *   behaves (login once, token valid 12h). This produces a realistic burst of
 *   ~100 logins during ramp-up followed by a steady stream of authenticated
 *   read/poll traffic, instead of hammering bcrypt on every iteration.
 *
 *   A small instructor scenario (2 VUs) simulates the admin Control Center
 *   polling telemetry / ctf-state / timer / participant list, mirroring the
 *   real dashboard load during a workshop.
 *
 * Install:  brew install k6
 * Run:      ./benchmark/run-benchmark.sh http://localhost:3000 clouddefenders2026
 * Env:      BASE_URL, REG_CODE, ADMIN_USER, ADMIN_PASS
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/* ── Custom metrics ── */
const errorRate     = new Rate('error_rate');
const loginTime     = new Trend('login_duration', true);
const registerTime  = new Trend('register_duration', true);
const leaderTime    = new Trend('leaderboard_duration', true);
const ctfPollTime   = new Trend('ctf_poll_duration', true);
const challengeTime = new Trend('challenges_duration', true);
const adminPollTime = new Trend('admin_poll_duration', true);
const authErrors    = new Counter('auth_errors');

/* ── Config ── */
const BASE_URL   = __ENV.BASE_URL   || 'http://localhost:3000';
const REG_CODE   = __ENV.REG_CODE   || 'clouddefenders2026';
const ADMIN_USER = __ENV.ADMIN_USER || 'ADMIN-2026';
const ADMIN_PASS = __ENV.ADMIN_PASS || '';

/* ─────────────────────────────────────────────────────────────
   Two parallel scenarios:
     • participants — ramping 0→50→100 VUs, login-once + steady polling
     • instructors  — 2 constant VUs running the Control Center
   Total ≈ 100 students + 2 instructors, as in a real workshop.
────────────────────────────────────────────────────────────── */
export const options = {
  scenarios: {
    participants: {
      executor: 'ramping-vus',
      exec: 'participantFlow',
      startVUs: 0,
      stages: [
        { duration: '30s',  target: 50  },  // warm-up
        { duration: '60s',  target: 100 },  // ramp-up (login burst)
        { duration: '120s', target: 100 },  // sustained load
        { duration: '30s',  target: 0   },  // cool-down
      ],
      gracefulRampDown: '30s',
    },
    instructors: {
      executor: 'constant-vus',
      exec: 'adminFlow',
      vus: 2,
      duration: '4m',
      startTime: '0s',
    },
  },
  thresholds: {
    'http_req_failed':      ['rate<0.01'],   // <1% errors
    'http_req_duration':    ['p(99)<2000'],  // p99 < 2 s
    'error_rate':           ['rate<0.01'],
    'login_duration':       ['p(95)<2000'],  // login bcrypts — burst during ramp
    'leaderboard_duration': ['p(95)<800'],
    'ctf_poll_duration':    ['p(95)<500'],
    'challenges_duration':  ['p(95)<800'],
  },
};

/* ── Helpers ── */
const json = (body) => JSON.stringify(body);
const headers = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
});

function checkResponse(res, name, expectedStatus = 200) {
  const ok = check(res, {
    [`${name} status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name} has body`]: (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!ok);
  return ok;
}

/* ─────────────────────────────────────────────────────────────
   Module-scope state — in k6 each VU runs in its own isolate, so
   module-level variables PERSIST across iterations of the same VU.
   This is what lets a VU authenticate once and reuse the token.
────────────────────────────────────────────────────────────── */
let vuToken = null;     // participant JWT, set on first iteration
let adminToken = null;  // instructor JWT, set on first iteration

/* ── Participant: first-iteration auth (register or login, ONCE) ── */
function authenticateParticipant(uname) {
  // Anonymous landing — the login screen polls these before auth.
  const homeRes = http.get(`${BASE_URL}/`, { tags: { flow: 'static' } });
  checkResponse(homeRes, 'homepage', 200);

  const ctfRes = http.get(`${BASE_URL}/api/challenges/ctf-state`, { tags: { flow: 'ctf-state' } });
  ctfPollTime.add(ctfRes.timings.duration);
  checkResponse(ctfRes, 'ctf-state-anon', 200);

  const telRes = http.get(`${BASE_URL}/api/challenges/telemetry`, { tags: { flow: 'telemetry' } });
  checkResponse(telRes, 'telemetry', 200);

  const regStatusRes = http.get(`${BASE_URL}/api/challenges/registration-status`, { tags: { flow: 'registration' } });
  checkResponse(regStatusRes, 'registration-status', 200);

  sleep(0.5);

  // Try to register. 200 → fresh user (we get a token directly).
  // 409 → user already exists from a previous run → fall through to login.
  // 403 → registration closed → fall through to login (user may already exist).
  const regRes = http.post(
    `${BASE_URL}/api/auth/register`,
    json({ username: uname, password: uname, registration_code: REG_CODE }),
    { headers: headers(null), tags: { flow: 'register' } }
  );
  registerTime.add(regRes.timings.duration);
  const regOk = check(regRes, {
    'register: 200 or 409 or 403': (r) => [200, 409, 403].includes(r.status),
  });
  errorRate.add(!regOk);

  if (regRes.status === 200) {
    try { return JSON.parse(regRes.body).token; } catch { return null; }
  }

  // Already registered (or reg closed) → log in with the same credentials.
  sleep(0.3);
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    json({ username: uname, password: uname }),
    { headers: headers(null), tags: { flow: 'login' } }
  );
  loginTime.add(loginRes.timings.duration);
  const loginOk = check(loginRes, {
    'login: 200 or 401': (r) => [200, 401].includes(r.status),
  });
  errorRate.add(!loginOk);

  if (loginRes.status === 200) {
    try { return JSON.parse(loginRes.body).token; } catch { return null; }
  }
  authErrors.add(1);
  return null;
}

/* ── Participant: steady-state authenticated dashboard cycle ── */
function participantDashboardCycle(token) {
  const authH = headers(token);

  // ctf-state poll — mirrors the frontend's 10 s interval
  const ctfAuthRes = http.get(`${BASE_URL}/api/challenges/ctf-state`, { headers: authH, tags: { flow: 'ctf-state-auth' } });
  ctfPollTime.add(ctfAuthRes.timings.duration);
  checkResponse(ctfAuthRes, 'ctf-state-auth', 200);
  sleep(0.3);

  // timer poll
  const timerRes = http.get(`${BASE_URL}/api/challenges/timer`, { headers: authH, tags: { flow: 'timer' } });
  checkResponse(timerRes, 'timer', 200);
  sleep(0.3);

  // leaderboard
  const lbRes = http.get(`${BASE_URL}/api/challenges/leaderboard`, { headers: authH, tags: { flow: 'leaderboard' } });
  leaderTime.add(lbRes.timings.duration);
  checkResponse(lbRes, 'leaderboard', 200);
  sleep(0.3);

  // participant challenge list
  const chalRes = http.get(`${BASE_URL}/api/challenges/participant`, { headers: authH, tags: { flow: 'challenges' } });
  challengeTime.add(chalRes.timings.duration);
  check(chalRes, { 'challenges: 200': (r) => r.status === 200 });
  sleep(0.3);

  // prompt usage (sidebar counter)
  const puRes = http.get(`${BASE_URL}/api/chat/prompt-usage`, { headers: authH, tags: { flow: 'prompt-usage' } });
  checkResponse(puRes, 'prompt-usage', 200);
  sleep(0.3);

  // prompt library (loaded when CTF is running)
  const plRes = http.get(`${BASE_URL}/api/chat/prompt-library`, { headers: authH, tags: { flow: 'prompt-library' } });
  checkResponse(plRes, 'prompt-library', 200);

  // Occasionally submit a challenge answer (~1 in 5 cycles)
  if (Math.random() < 0.2) {
    sleep(0.3);
    const checkRes = http.post(
      `${BASE_URL}/api/challenges/participant/1/check`,
      json({ participant_text: 'test_keyword_answer' }),
      { headers: authH, tags: { flow: 'challenge-check' } }
    );
    check(checkRes, {
      'challenge-check: acceptable status': (r) => [200, 403, 404, 429].includes(r.status),
    });
  }

  // Think time → full dashboard cycle ≈ 10 s, matching the real poll cadence.
  sleep(7 + Math.random() * 2);
}

/* ── Scenario: participant ── */
export function participantFlow() {
  const uname = `bku${String(__VU).padStart(3, '0')}`;  // e.g. bku001

  // Authenticate exactly once per VU; reuse the token thereafter.
  if (vuToken === null) {
    vuToken = authenticateParticipant(uname);
    if (vuToken === null) {
      // Could not authenticate (e.g. registration closed on a fresh DB) →
      // behave as a passive anonymous visitor and retry next iteration.
      sleep(2);
      return;
    }
    // First iteration ends right after login, like a real arriving user.
    return;
  }

  participantDashboardCycle(vuToken);
}

/* ── Scenario: instructor / admin Control Center ── */
export function adminFlow() {
  // Login once; if no admin password is configured, idle quietly.
  if (adminToken === null) {
    if (!ADMIN_PASS) { sleep(5); return; }
    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      json({ username: ADMIN_USER, password: ADMIN_PASS }),
      { headers: headers(null), tags: { flow: 'admin-login' } }
    );
    loginTime.add(loginRes.timings.duration);
    if (loginRes.status === 200) {
      try { adminToken = JSON.parse(loginRes.body).token; } catch { adminToken = null; }
    }
    if (adminToken === null) { sleep(5); return; }
    return;
  }

  const authH = headers(adminToken);

  // Control Center dashboard — heavier polling than a participant.
  const telRes = http.get(`${BASE_URL}/api/challenges/telemetry`, { headers: authH, tags: { flow: 'admin-telemetry' } });
  adminPollTime.add(telRes.timings.duration);
  checkResponse(telRes, 'admin-telemetry', 200);
  sleep(0.3);

  const ctfRes = http.get(`${BASE_URL}/api/challenges/ctf-state`, { headers: authH, tags: { flow: 'admin-ctf-state' } });
  adminPollTime.add(ctfRes.timings.duration);
  checkResponse(ctfRes, 'admin-ctf-state', 200);
  sleep(0.3);

  const timerRes = http.get(`${BASE_URL}/api/challenges/timer`, { headers: authH, tags: { flow: 'admin-timer' } });
  adminPollTime.add(timerRes.timings.duration);
  checkResponse(timerRes, 'admin-timer', 200);
  sleep(0.3);

  const codesRes = http.get(`${BASE_URL}/api/admin/codes`, { headers: authH, tags: { flow: 'admin-codes' } });
  adminPollTime.add(codesRes.timings.duration);
  checkResponse(codesRes, 'admin-codes', 200);
  sleep(0.3);

  const lbRes = http.get(`${BASE_URL}/api/challenges/leaderboard`, { headers: authH, tags: { flow: 'admin-leaderboard' } });
  adminPollTime.add(lbRes.timings.duration);
  checkResponse(lbRes, 'admin-leaderboard', 200);

  // Instructor watches more actively than students → ~5 s cadence.
  sleep(4 + Math.random() * 2);
}
