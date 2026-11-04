# ActionLedger: testing approval-gated agent actions and recovery after worker failure

**Status: local prototype; reproducible demonstration, not a production safety guarantee.**

An agent asks to execute an invoice action. The agent framework can require approval, but a system that owns the simulated business action may also need its own authoritative policy and durable state. What happens when a worker dies after a provider may already have acted? ActionLedger is a small local laboratory for exploring those questions with synthetic invoices and no real payments.

## The experiment

The prototype combines a Next.js dashboard, a Fastify API and a local SQLite ledger. Amounts above €500 require a review state change. The SQLite worker rechecks the stored invoice state before creating a simulated effect, which is unique per invoice. The dashboard and default local API have no production authentication and must not be exposed to the internet.

The OpenAI Agents SDK example uses the actual SDK runner and a `ScriptedModel` test double. In the reproducible demo an agent requests a €2,500 action. The SDK pauses for its approval. After the test accepts that interruption, the independent ledger still rejects the request because its own review state is pending. A fixture reviewer then approves the ledger action and a second simulated agent run completes one simulated effect. The SDK provides its own tool guardrails and human-approval mechanisms; the example shows one additional state-based enforcement point, not an inherent limitation of the SDK.

Run with Node 24:

```sh
npm ci
npm run demo:showcase
npm run lab:reliability
npm run benchmark:security -- holdout
```

The demo uses a temporary database, fake identities and a scripted model. It makes no OpenAI or Foundry model call and sends no payment. The local reliability test uses a loopback HTTP fixture; restrictive sandboxes must permit local connections.

## Failure and recovery

For local effects, the SQLite lab terminates an actual worker after it claims a job, then recovers the job on startup. Parallel process tests race workers against the same queue. The local effect and completed status are stored transactionally, with a unique effect per invoice; those results apply to this particular local simulation.

A separate experimental provider lab explores a harder boundary. An external system can perform an effect and lose the response, so a timeout or process death cannot establish whether the operation occurred. Its state machine marks the outcome `unknown` and refuses automatic retries. In tests, a loopback fake provider registers an effect and drops or delays its response, or the worker is killed; subsequent attempts stay blocked pending an explicit fixture reconciliation. This does **not** establish exactly-once behavior for real non-idempotent services. The provider lab and SDK demonstration are separate; no distributed lease, production reviewer identity, or genuine provider reconciliation has been implemented.

## Evaluation design and limits

The local security suite has 1,200 generated cases across development and holdout splits. They cover prompt-like text, permission spoofing, invalid invoice amounts, invalid approvals and legitimate workflows. It reports attack success, false positives and legitimate completion, with technical errors marked inconclusive. Cases are synthetic variations of a small set of templates. The holdout uses different values and wording but was produced by the same author and generator, so it is neither independently authored nor a blind benchmark. A scripted model does not test real-model prompt-injection resistance.

For observability, the SQLite API records structured workflow events keyed to an invoice and linked to request trace/span IDs. OpenTelemetry spans are bounded and held locally in memory; events survive a local database restart. Separate HTTP requests are correlated by workflow ID rather than being one continuous distributed trace. Some failure windows and the PostgreSQL path are not covered by the event instrumentation, and the log is not tamper-evident.

## Performance measurement

The project includes a reproducible local benchmark that compares the same sequential create-and-simulate workload in ActionLedger and a minimal Fastify/SQLite baseline. The baseline omits review, audit, recovery and telemetry, so it is an implementation-level comparison, not the isolated overhead of one check. The report includes p50/p95/p99, throughput, process CPU time, sampled peak RSS, response errors and five local crash-recovery trials. Raw samples, system metadata and source hashes accompany it. Three runs per variant and five recovery observations are too few for strong tail-latency or significance claims, especially on an uncontrolled developer machine.

In the captured run (360 workflows per variant), the baseline p50/p95/p99 was 14.800/18.440/64.418 ms and ActionLedger was 47.885/55.922/495.039 ms; throughput was 60.174 versus 16.946 workflows/s. The observed error rate was 0% in each variant. The high ActionLedger p99 is a reason to inspect raw samples, not a stable prediction. Local crash-recovery median was 36.092 ms over five trials; that measurement does not include a separate server-process restart or external reconciliation.

Consult `benchmark/results/local-sanitized/REPORT.md`, `workflows.csv` and `results.json` for the actual captured results. The capture predates Git: no commit is claimed, and line-ending normalization means three recorded source hashes do not match the subsequent checkout. The exact captured bytes are therefore not independently established by the commit. Run `npm run benchmark:performance` from a clean checkout to produce a new commit-associated measurement; results vary by host and load.

## Current boundaries and next work

There is no verified live OpenAI/Foundry model connection, production identity, deployed cloud environment, actual payment system, tamper-proof audit, or independently designed benchmark. PostgreSQL integration, CI and Docker smoke tests passed on a GitHub Actions runner; the local development machine has not run Docker. The private GitHub repository is not an accessible public artifact yet.

The most useful next step is to publish a reviewed source snapshot with a commit hash and reproduce the tests on a fresh environment, followed by independently authored test cases and authentication. The point of the project is to make the failure boundaries inspectable—not to claim that an agent is safe because a synthetic suite passes.
