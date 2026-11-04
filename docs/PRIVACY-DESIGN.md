# Privacy design — local prototype

The current application is a single-user local demo for synthetic records. It has no production identity, per-user storage isolation, secure public ingress or verified age gate. Do not present it as a multi-user service or use real personal data.

There is no optional analytics or advertising integration in the application. Local OpenTelemetry metrics and spans are process-local; SQLite workflow events persist. If optional tracking is introduced, keep it technically disabled until an affirmative, purpose-specific choice, permit rejection without blocking the service, support withdrawal, and test that no optional request or storage occurs before consent or after withdrawal. A banner alone is not enforcement. Reassess the actual deployed infrastructure and hosting logs.

The repository's `npm run dev`, `npm run build`, and `npm run start` commands start Next.js with `NEXT_TELEMETRY_DISABLED=1` to disable Next.js developer telemetry. Running `next` directly bypasses this wrapper; set the variable yourself for direct invocations. This setting is separate from the local application metrics described above and does not control telemetry from other tools or hosting infrastructure.

Before multi-user access, define a trusted identity and tenant model, authorize every read and write server-side, enforce tenant boundaries in the database (including background jobs and audit access), add migrations and adversarial integration tests, and review database credentials, backups and encryption. Client-supplied tenant IDs or a front-end filter are not isolation.

Age handling needs an explicit product audience and jurisdiction, data minimization, an age-appropriate flow and legal review. A self-declared age is not verified age or parental authorization. Do not collect birth dates by default or claim compliance from a simple checkbox.

Before launch, complete the public privacy notice with the real controller, contact, lawful purposes, recipients, retention, user rights and applicable transfer details. Review the notice and any consent or age flow with qualified counsel for the deployment jurisdiction.
