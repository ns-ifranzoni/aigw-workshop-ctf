# Changelog

## v1.2.0
- **Feature:** new challenge variable `%gateway_private_url`, resolved to the private Gateway URL (`gateway_url_private`, falling back to the public one when "Same" is ticked). Like `%gateway_url`, the protocol is stripped so only host and optional port remain. Listed in the "Available variables" popover and the Text key placeholder of the challenge editor.

## v1.1.9
- **UI:** the AI Gateway "Next expected sync" countdown moved out of the participant Settings panel and now sits as a "Next sync" chip in the participant header, next to the CTF timer. It loads on sign-in instead of when Settings is opened.
- **Feature:** Admin → AI Gateway now has a **Public** and a **Private** Gateway URL. The private URL appears below the public one and mirrors it while the **Same** checkbox is ticked (default); unticking it allows a different value. It is stored as `gateway_url_private` (empty = same as public) and used only for the AI Gateway Status lookups (`/api/admin/netskope/appliances` and the participant next-sync endpoint). The Test button checks the public URL only; chat proxying, MCP and `%gateway_url` still use the public one.

## v1.1.8
- **Security:** the default admin API token is no longer a fixed value. It shipped as `admin-key` in the repo, and since an admin `api_key` is accepted as a bearer token, anyone could reach the whole admin API on a fresh install without a password. Now generated per install (and per factory reset), and existing installs still holding the old value are rotated automatically on startup — read the new token in **Admin → Admins → View / copy API token**.
- **Fix:** event-based challenges (`transaction_id` / `event_*`) could never be completed. The verification query rebuilt the token group name from the participant code, which is uppercased, while the real group is created with the username as typed (`Participant-Group-nsgamer` vs `…-NSGAMER`). It now uses the token group name stored at creation time, which also fixes custom prefixes chosen during bulk creation.
- **Fix:** a failing or rate-limited tenant no longer costs the participant 5 points and a retry. The four challenge verification calls did not check the HTTP status, so a 429 looked like an empty result and counted as a wrong answer. They now go through the shared Netskope client, which retries on 429 and surfaces real errors as `502` without recording an attempt.
- **Security:** the chat MCP mode validated nothing about the server URL sent by the client, letting an authenticated participant make the portal issue requests to arbitrary hosts. It is now checked against the admin-approved MCP server list.
- **Fix:** `/v2` and `/v2/*` returned HTTP 500 — they pointed at an interface that is not in the repo. Removed; the SPA fallback handles those paths.
- **Fix:** the AI Provider connection test sent a hardcoded `gpt-4o-mini` to every provider, so any non-OpenAI provider failed the test with "model not found" even with a valid API key. It now exercises only a model the admin enabled for that provider, and otherwise just verifies connectivity and credentials with `GET /models` — no model guessing and no token spend.
- **Fix:** testing a Bedrock provider reported the misleading "No API token configured" and never left the box. Bedrock signs with SigV4 and keeps its credentials in Settings, so the test now delegates to the same check the provider-token panel uses; both report identically instead of potentially contradicting each other.
- **Security:** the authentication endpoints are now rate limited. Only *failed* attempts count, and the limit is keyed on the account being targeted (10 failures per username per 15 min, plus a loose per-IP ceiling for spraying) — a classroom sharing one public IP is never throttled for signing in or registering successfully.
- **Security:** `/api/settings/gateway-url`, `/api/settings/tenant`, `/api/settings/aiproviders`, `/api/admin/settings/models/public` and `/api/admin/mcp-servers/public` now require a session. They describe the lab's infrastructure — gateway host, tenant hostname, provider and MCP endpoints — and were readable by anonymous visitors of the login page. The login screen's own telemetry (participant/challenge counts, CTF state) stays public.
- **Fix:** the prompt quota is now claimed in a single atomic statement. Reading the counter and then incrementing it let two concurrent sends both take the last free slot; the reservation is refunded when the provider call fails, so the counter still only bills answered prompts.
- **Fix:** syncing AI providers now removes providers the tenant no longer offers. The sync only ever upserted, so predefined providers retired by Netskope lingered in the local cache and stayed selectable. Manually created providers are never touched.
- **Cleanup:** removed the `https.Agent` in the provider test that was built to allow self-signed certificates and never applied (global `fetch` takes a `dispatcher`, not an `agent`), so the leniency it promised never existed. Certificate problems are now reported as "reachable, but its TLS certificate is not valid", as in the gateway test.
- **Security:** deleting a conversation removed its messages without checking who owned it. A participant holding another participant's conversation id could empty that chat — the conversation row survived, so the owner was left with an empty history and no indication why. Ownership is now verified first, and the endpoint returns `404` instead of reporting success for a conversation that is not yours.
- **UI:** the Gateway URL test now reports reachability and nothing else. An unauthenticated probe to the AI Gateway legitimately answers `401`, and "✓ Reachable (401 Unauthorized)" read as a failure; it now says just "✓ Reachable". A certificate problem (self-signed, expired, hostname mismatch, untrusted root) is reported as "⚠ Reachable, but its TLS certificate is not valid (<reason>)" — the handshake did return a certificate, so the gateway is up, it just cannot be verified. TLS verification stays enabled: the message changed, the behaviour did not. A failed TLS negotiation (typically `https://` against a port serving plain HTTP) now says so instead of printing a raw OpenSSL error.
- **Fix:** in Direct mode, Bedrock requests were built in Anthropic's InvokeModel format for every model, so all three models offered in the UI (Nova Lite, Nova Micro, Llama 3.3 70B) were rejected by AWS. Bedrock now uses the **Converse API**, which takes one request and response shape for every model family. Consecutive same-role turns — left behind by a failed send — are merged, since Converse requires alternating roles.

## v1.1.7
- Feature: **AI Gateway next sync** — new section at the top of the participant Settings panel with a live countdown to the next expected appliance sync, served by the authenticated `/api/settings/ai-gateway-sync` endpoint (no admin API exposed).
- UI: "Current config" header above the session summary, and tighter section spacing to avoid scrolling.

## v1.1.6
- UI: Font changed from Arial to Lato (Google Fonts, sans-serif) across the entire UI.

## v1.1.5
- Feature: **AI Gateway section** — new admin panel with live appliance status (CPU, memory, disk, version, uptime, reachability) fetched from the Netskope tenant API, filtered to the configured gateway host.
- Feature: **Netskope Tenant panel** — API Token field now shows masked value (`••••` + last 4 chars) when a token is configured; empty when not.
- UI: Netskope Tenant card renamed to "Netskope tenant RestAPI token".
- Fix: HTTP request logging disabled (`autoLogging: false`) — console now only shows errors.

## v1.1.4
- Fix: Docker crash on cold start — `challenge_attempts` indexes were created before the table existed (migration ordering bug). Indexes now created immediately after the table.

## v1.1.3
- Fix: Route toggle (Direct/Secured) now persists across page refreshes — state is saved to participant config on every toggle.
- Feature: Input footer message updates dynamically when switching to Direct mode ("Routed directly to LLM · All traffic is unsecured and not monitored") in all 5 languages.
- UI: CSS and layout improvements (Codex).

## v1.1.1
- Feature: **Policy · DLP** challenge type — verifies a matching DLP rule exists via `/api/v2/policy/aig/dlp/rules` (token group + activity + action + model).
- Feature: **Policy · Guardrails** challenge type — verifies a matching guardrails rule exists via `/api/v2/policy/aig/aiguardrails/rules` (token group + activity + action + model).
- Fix: Events challenge queries now use `x_aig_policy_evaluation.type` instead of `transaction_category` — field confirmed against real tenant; guardrails maps to `"aisecurity"`.

## v1.1.0
- See GitHub release notes.

## v1.0.0 — GA
- See GitHub release notes.
