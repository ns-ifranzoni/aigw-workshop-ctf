# Benchmark de carga — CTF Workshop

Script k6 para validar que la app soporta 100 usuarios concurrentes.

## Instalación

```bash
brew install k6
```

## Ejecución rápida

```bash
chmod +x benchmark/run-benchmark.sh
./benchmark/run-benchmark.sh http://localhost:3001 clouddefenders2026
```

## Ejecución manual

```bash
# Con URL y código de registro personalizados
BASE_URL=http://tu-servidor:3001 REG_CODE=mi-codigo k6 run benchmark/k6-load-test.js

# Con salida JSON
k6 run --out json=benchmark/results/run.json benchmark/k6-load-test.js

# Ver resumen en tiempo real con InfluxDB+Grafana (opcional)
k6 run --out influxdb=http://localhost:8086/k6 benchmark/k6-load-test.js
```

## Perfil de carga

| Fase       | Duración | VUs (usuarios) |
|------------|----------|----------------|
| Warm-up    | 0–30 s   | 0 → 50         |
| Ramp-up    | 30–90 s  | 50 → 100       |
| Sostenida  | 90–210 s | 100            |
| Cool-down  | 210–240 s| 100 → 0        |

Total: ~4 minutos

## Umbrales de aceptación

| Métrica               | Umbral       |
|-----------------------|-------------|
| Error rate            | < 1 %       |
| p95 latencia          | < 1 000 ms  |
| p99 latencia          | < 2 000 ms  |
| Login p95             | < 2 000 ms  |
| Leaderboard p95       | < 800 ms    |
| CTF state poll p95    | < 500 ms    |

## Notas

- Los VUs se registran en la primera iteración. Si la app tiene el registro cerrado,
  cambia `REG_CODE` al código correcto o usa usuarios pre-creados editando el script.
- El endpoint `/api/challenges/participant/1/check` usa challenge ID=1. Ajusta si es necesario.
- El chat (proxy a AI Gateway) **no está incluido** en el benchmark: su latencia depende
  de la red y del modelo externo, y contaminaría las métricas de la app propia.
