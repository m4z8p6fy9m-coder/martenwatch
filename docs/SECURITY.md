# Security model and boundaries

## Goal and threat model

ActionLedger simulates invoice review. Invoice text and model output are untrusted. An adversary may embed instructions in a vendor field or an agent response, supply forged role or tenant headers, call an action without approval, repeat requests, or interrupt a worker. These are local test scenarios, not a claim of complete protection.

## Controls and evidence

| Risk | Control | Evidence | Limit |
| --- | --- | --- | --- |
| Model instruction attempts | The agent only returns advice; the server decides on the amount independently. | `tests/security-lab.test.mjs` | Offline fake provider; not a real-model red-team evaluation. |
| Privilege spoofing | In the lab, an injected authenticator supplies roles; unlisted route permissions deny by default. | `tests/security-lab.test.mjs` | Test identity only. The normal demo has no sign-in. |
| Request floods | The SQLite and PostgreSQL demo APIs apply an in-process per-IP limit of 300 requests per minute. | `tests/security-lab.test.mjs`, `tests/postgres.test.mjs` | Local process only; no distributed enforcement, trusted-proxy setup or production authentication. Benchmarks explicitly raise the SQLite test limit. |
| Cross-tenant access | An isolated lab routes trusted fixture identities to separate SQLite stores. | `tests/tenant-lab.test.mjs` | This is a test harness, not production multi-tenancy or a shared-database isolation proof. |
| Execution before approval | Gateway and SQLite worker check status before the simulated effect. | `tests/security-lab.test.mjs`, `tests/recovery.test.mjs` | PostgreSQL adapter and distributed execution require live verification. |
| Replays and interruptions | Unique simulated effect per invoice; effect and completion event are transactional. | `tests/recovery.test.mjs` | No exactly-once guarantee for external services. Single recovery coordinator only. |

## Deployment gate

Do not expose this prototype to the internet or use real invoices. Before a deployment: implement and test real identity, tenant ownership checks on every read and write, reviewer authorization, CSRF protections, secure configuration, audit identity, database migrations, and a tested operational and incident-response model. Never treat the test role headers, fixture tokens or the local `requireIdentity` adapter as production authentication.

## Security scanning

The CI workflow includes `npm audit --audit-level=high` for development and production dependencies. The first GitHub Actions dependency audit and Gitleaks secret scan passed. CodeQL is configured; consult GitHub Actions for its current result. A clean scan is time-dependent and does not prove the application is safe. GitHub CodeQL availability and Actions limits depend on repository and account settings.

For this private repository, GitHub code scanning could not accept the CodeQL upload. The workflow instead retains the raw SARIF as a short-lived Actions artifact and fails if the SARIF contains findings; it does not populate GitHub's code-scanning alerts. An unavailable or invalid SARIF also fails the check. Verify the workflow run and artifact before relying on the result.
