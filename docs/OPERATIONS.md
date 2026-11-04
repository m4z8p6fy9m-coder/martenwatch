# Local operations and reproducibility

## Prerequisites

Node.js 24 and npm. Run `npm ci`, `npm test`, and `npm run benchmark`. The API uses a local SQLite file under ignored `data/`; the default server listens only on `127.0.0.1:4000`. The Next.js UI proxies to it locally. Do not use real data.

## Metrics and traces

`GET /api/telemetry` returns the latest retained in-memory OpenTelemetry spans and metric data for the SQLite API. Request routes, status codes, simulation and security outcomes, model calls, model token counts when provided, API-process CPU time and API-process RSS/heap are recorded. CPU is cumulative process CPU time in seconds, not a live utilization percentage; RSS and heap are bytes at collection time. These values do not include other processes, GPU or whole-machine resources. Collection happens when the endpoint is read. Up to 200 completed spans are retained internally, with the latest 100 returned. The data resets on restart and no remote exporter is configured. Prompt contents, invoice values and credentials are excluded from these telemetry attributes, but application logs and local data remain sensitive.

## Benchmark

The benchmark is deterministic in workload, not in timing: 100 simulated invoices, every fourth above the threshold; ten completed jobs are put into a synthetic interrupted state before recovery. It reports scenario version, Node version, OS family, architecture, counts, elapsed time and request p50/p95. Those times include in-process Fastify injection and local database work, not a network, model inference or cloud latency. Compare only with the same scenario, version, hardware and runtime and record multiple runs. Real process-kill and four-worker concurrency are separately exercised in tests.

## Configuration and secrets

`.env.example` contains placeholders only. Supply `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_NAME` and optionally `DATABASE_URL` through the local environment or a secret manager; never commit real values, school identifiers, tokens, local data files or screenshots. A Foundry call may consume paid Azure credit and is not executed by local tests. The existing Foundry adapter and PostgreSQL adapter are not yet live verified. Databricks and cloud hosting are not configured.

## Recovery limitations

Only one API instance should perform startup recovery. Parallel worker processes were tested locally, but concurrent API startups and distributed leases are not implemented. An external real-world effect requires a provider-supported idempotency key, authorization, reconciliation and failure handling; this demo has none.
