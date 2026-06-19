# Changelog

## v1.1.1
- Feature: **Policy · DLP** challenge type — verifies a matching DLP rule exists via `/api/v2/policy/aig/dlp/rules` (token group + activity + action + model).
- Feature: **Policy · Guardrails** challenge type — verifies a matching guardrails rule exists via `/api/v2/policy/aig/aiguardrails/rules` (token group + activity + action + model).
- Fix: Events challenge queries now use `x_aig_policy_evaluation.type` instead of `transaction_category` — field confirmed against real tenant; guardrails maps to `"aisecurity"`.

## v1.1.0
- See GitHub release notes.

## v1.0.0 — GA
- See GitHub release notes.
