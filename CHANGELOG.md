# Changelog

## v1.3.0
- Verification: **Events · Access Control** challenge type confirmed working against real Netskope tenant — events API query with `transaction_category eq "access"` filter + participant token group + configurable time window.
- Internal: verified end-to-end check flow for Text, Policy · Access Control, and Events · Access Control challenge types.

## v1.2.0
- Feature: **Policy · Access Control** challenge type uses the Netskope policy API (`/api/v2/policy/aig/access/rules`) instead of the events API — verifies that a matching rule exists for the student's token group, activity, action and model.
- Feature: new **Model** field in challenge config (text input) — used as filter on `ai_provider_models[].match_values` in Policy checks.
- UI: Activity dropdown updated to Download / Others / Prompt / Upload; Action dropdown updated to Monitor / Block / Replace.
- Internal: `ch_model` column added to `challenges` table; policy challenge types skip `ns_query` generation.

## v1.1.8
- Feature: challenge types restructured into three groups — **Text**, **Policy** (Access Control, DLP, Guardrails) and **Events** (Access Control, DLP, Guardrails).
- UI: single horizontal toggle bar for challenge type selection; group labels ("Policy:", "Events:") are non-selectable, subtypes are colour-coded per group (green / blue / purple).
- Feature: variable interpolation in Text challenge keys — `%gateway_url` and `%tokengroup` are expanded at check time with the configured Gateway URL and the participant's assigned Token Group.
- UI: info icon next to "Text key" field showing available variables on hover (instant dark tooltip with line breaks).
- Internal: Transaction Type is now auto-derived from the challenge type suffix; the separate dropdown has been removed.
- Backward-compat: legacy challenge types (`transaction_id`, `dlp`, `ai_guardrails`) are silently remapped to their new equivalents on edit.

## v1.1.2
- Fix: bump the front-end asset cache-bust token (`app.js`/`i18n.js` `?v=3` → `?v=4`) so browsers stop serving a stale pre-fix `app.js`. The stale copy still had the old login guard that silently returned on an empty password, breaking ADMIN-2026 first-login/factory-reset setup ("nothing happens on Login"). The fix itself shipped in v1.0.0 but the unchanged cache token kept old browsers on the buggy script.

## v1.1.1
- UI: further visual refinements to the admin portal styling and layout.

## v1.1.0
- UI: extensive visual refresh of the admin portal (layout, styling and markup across the Control Center and admin pages).

## v1.0.0 — GA

First general-availability release of the Netskope AI Gateway Workshop & CTF portal.

**Participant portal**
- Chat console with Secured (via AI Gateway) and Direct routing modes.
- Prompt Library as compact, full-text rows with drag-and-drop and click-to-insert; panel stays open after a drop.
- Empty state with quick-access shortcuts (Prompt Library, Capture the Flag, Guidelines) on first load.
- Capture the Flag challenges, live leaderboard, conversation history.
- Multi-language UI (EN, ES, PT, FR, DE) and dark/light themes.
- Responsive layout for mobile (off-canvas nav, compact header, full-width route toggle).

**Admin portal**
- Control Center with CTF timer (defaults to 2 hours), registration code and state semaphores.
- Dashboard, participants (incl. bulk creation with auto-assigned Netskope tokens), GW tokens, AI providers, MCP servers, prompt library and challenges management.
- Challenge types: AI Gateway Events, DLP and AI Guardrails (event-based) plus Text (keyword) challenges.
- Settings panel with live session summary (route, mode, model/MCP server, GW token status).
- Setup wizard for Netskope tenant, AI Gateway URL and API token; MCP step pulls servers live from the tenant.
- "The CTF Awards Ceremony" fullscreen prize reveal, in-app "Update now", and a Clear Database / Factory Reset toolkit.

**Defaults & security**
- Default admin (`ADMIN-2026`) ships without a password: it is set on first sign-in, so no known default credential is shipped. Factory Reset returns the admin to this state.
- Self-registration code defaults to `clouddefenders2026`; CTF timer defaults to 2 hours; both restored on Factory Reset.
- Passwords hashed with bcrypt; JWT secret auto-generated and persisted (env-overridable).
- API token fields are excluded from password-manager prompts.

**Packaging**
- Single self-hosted container (Docker / docker-compose) with SQLite persistence bind-mounted to `./data`.
- MIT licensed.
