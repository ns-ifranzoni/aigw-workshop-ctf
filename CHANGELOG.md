# Changelog

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
