# Local performance experiment

Generated UTC: 2026-11-02T20:40:44.348Z. Git commit: unavailable: this directory is not a Git checkout. Source hashes and environment are in results.json. This is a local experiment, not a production capacity claim.

| Metric | Minimal baseline | ActionLedger |
|---|---:|---:|
| p50 (ms) | 14.8 | 47.885 |
| p95 (ms) | 18.44 | 55.922 |
| p99 (ms) | 64.418 | 495.039 |
| Throughput (workflows/s) | 60.174 | 16.946 |
| Process CPU time/workflow (ms) | 7.942 | 22.267 |
| Sampled peak RSS (MiB) | 77.551 | 89.219 |
| Error rate (%) | 0 | 0 |

Local crash recovery (5 trials): p50 36.092 ms; p95 37.968 ms; p99 37.968 ms. Five samples are insufficient for reliable tail latency. Raw trials and success checks are in results.json. The baseline has no recovery implementation and is not compared for recovery.

See [method and limitations](../../PERFORMANCE.md) and [raw per-workflow data](workflows.csv).
