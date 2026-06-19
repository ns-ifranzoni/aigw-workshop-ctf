#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  run-benchmark.sh — ejecuta el benchmark de carga k6
#  Uso:  ./benchmark/run-benchmark.sh [BASE_URL] [REG_CODE]
#  Admin: exporta ADMIN_PASS para activar el escenario de instructor, p.ej.
#         ADMIN_PASS=ADMIN-2026 ./benchmark/run-benchmark.sh http://localhost:3000
# ─────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
REG_CODE="${2:-clouddefenders2026}"
ADMIN_USER="${ADMIN_USER:-ADMIN-2026}"
ADMIN_PASS="${ADMIN_PASS:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="benchmark/results"
OUT_JSON="${RESULTS_DIR}/run_${TIMESTAMP}.json"
OUT_HTML="${RESULTS_DIR}/run_${TIMESTAMP}.html"

# ── Comprobaciones previas ──────────────────────────────────
if ! command -v k6 &>/dev/null; then
  echo ""
  echo "ERROR: k6 no está instalado."
  echo "Instala con:  brew install k6"
  echo "              https://k6.io/docs/get-started/installation/"
  echo ""
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  CTF Workshop — Benchmark de carga (k6)   ║"
echo "╠════════════════════════════════════════════╣"
echo "║  Target:   ${BASE_URL}"
echo "║  Reg code: ${REG_CODE}"
echo "║  Admin:    ${ADMIN_USER} $([ -n "${ADMIN_PASS}" ] && echo '(scenario ON)' || echo '(scenario OFF — set ADMIN_PASS)')"
echo "║  Output:   ${OUT_JSON}"
echo "╚════════════════════════════════════════════╝"
echo ""

# ── Verificar que la app responde antes de empezar ──────────
echo "► Verificando que la app está disponible…"
if ! curl -sf "${BASE_URL}/api/health" -o /dev/null; then
  echo "ERROR: La app no responde en ${BASE_URL}."
  echo "Asegúrate de que el servidor está corriendo (npm start o docker compose up)."
  exit 1
fi
echo "  ✓ App disponible"
echo ""

# ── Crear directorio de resultados ─────────────────────────
mkdir -p "${RESULTS_DIR}"

# ── Ejecutar k6 ────────────────────────────────────────────
echo "► Iniciando test de carga (duración total ~4 minutos)…"
echo ""

k6 run \
  --out json="${OUT_JSON}" \
  -e BASE_URL="${BASE_URL}" \
  -e REG_CODE="${REG_CODE}" \
  -e ADMIN_USER="${ADMIN_USER}" \
  -e ADMIN_PASS="${ADMIN_PASS}" \
  benchmark/k6-load-test.js

echo ""
echo "═══════════════════════════════════════════"
echo "  Resultados JSON guardados en:"
echo "  ${OUT_JSON}"
echo ""
echo "  Para analizar con jq:"
echo "  cat ${OUT_JSON} | jq 'select(.type==\"Summary\")'"
echo "═══════════════════════════════════════════"
echo ""

# ── Resumen rápido de métricas clave ───────────────────────
if command -v jq &>/dev/null; then
  echo "► Métricas clave del run:"
  echo ""
  jq -r '
    .metrics |
    "  http_req_duration p(95): " + (.http_req_duration.values["p(95)"] | tostring) + " ms",
    "  http_req_duration p(99): " + (.http_req_duration.values["p(99)"] | tostring) + " ms",
    "  http_req_duration avg:   " + (.http_req_duration.values.avg | tostring) + " ms",
    "  http_req_failed rate:    " + ((.http_req_failed.values.rate * 100) | tostring) + " %",
    "  http_reqs total:         " + (.http_reqs.values.count | tostring),
    "  http_reqs/s:             " + (.http_reqs.values.rate | tostring)
  ' "${OUT_JSON}" 2>/dev/null || echo "  (instala jq para ver el resumen: brew install jq)"
fi
