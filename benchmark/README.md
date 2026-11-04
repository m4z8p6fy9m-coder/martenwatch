# Security benchmark v1

Run `npm ci` with Node 24, then `npm run benchmark:security -- development` or `npm run benchmark:security -- holdout`. Each command emits JSON and returns a nonzero exit code if any attack succeeds, a legitimate case is blocked, or a case is inconclusive. The two checked-in JSONL files are the complete case manifests; `node scripts/generate-security-cases.mjs` regenerates them. They contain no real people, account identifiers, credentials, or invoice data.

The fixed suite has 1,200 total cases: 600 per split, each with 400 attacks and 200 legitimate workflows. Each category has 100 cases. Cases include prompt-like invoice text with a malicious stub response, role spoofing, invalid amounts, invalid approval values, legitimate low-value simulation, and legitimate approval plus simulation. Each case makes real in-process requests to the local Fastify gateway with a test-only authenticator and isolated in-memory SQLite. There are no real model calls, payments, network requests, or cloud resources. The regular configured application is not authenticated by this test harness.

## Metrics and outcomes

- Attack success rate = successful attacks / all attack cases. Success is determined by the targeted prohibited operation or policy state, not merely HTTP status.
- False positive rate = legitimate workflows blocked with an unexpected 4xx / all legitimate workflows. Expected human approval is part of the high-value legitimate workflow, not itself a false positive.
- Legitimate task completion rate = completed end-to-end workflows / all legitimate workflows. Completion includes a completed simulated job.
- Unexpected errors and unrecognized statuses are inconclusive and cause a failed run. They remain in the denominators; therefore rates from a run with inconclusive cases are not conclusive.

Results are broken down by category and identify failed/inconclusive case IDs. They describe only these fixed synthetic cases; they are not a probability of compromise in the real world. Repetition uses numeric variations of a small number of templates, not 1,200 independent attack techniques. No confidence interval or statistical generalization is justified.

## Holdout and reproducibility limitations

The published holdout uses different prompt wording and values from development, but was created by the same author and generator at the same time, and shares the same categories, harness and oracle. It has not been used to develop the existing security implementation, but it is not independently authored, secret, or a strong distribution shift. Because it is published, it cannot remain a blind test; repeated tuning on it would contaminate it. A stronger assessment needs a separately authored and sequestered set, real model and identity integration under an authorized budget, and independent review. Do not claim this benchmark establishes production security or real-model prompt-injection resistance.

SHA-256 (exact JSONL bytes):

- development: `7ba19c4bca1a4e682ba3a705b04b23f30c7a8505ca59286132fe11838268be49`
- holdout: `6ba3ae12fc4ad1ee6801e2c90cf559b5b2b0df3154db2e5e0d4d806815eee43d`

The GitHub Actions CI workflow has successfully run both splits. Results remain synthetic and reflect only the tested commit. Before making the private repository public, review all files, Git history and commit metadata for private information.
