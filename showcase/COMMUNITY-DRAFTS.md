# Community post drafts — not published

## Show HN, once the repository is actually public and runnable

Title: `Show HN: A local lab for approval-gated agent tool calls and crash recovery`

Body / first comment:

I built ActionLedger, a local prototype for studying what happens when an agent proposes a simulated invoice action, approval is required, and the worker or provider fails. It combines a deterministic server-side policy, a SQLite-backed simulated ledger, an OpenAI Agents SDK example with a scripted model, and offline reliability tests that kill real worker processes and simulate timeouts.

In one controlled SDK test, the SDK's own approval interruption is accepted, but the separate ledger still refuses the action until its own review state is approved. The SDK can itself implement tool guardrails and approval; this demo illustrates a second enforcement point, not a claim that the SDK lacks those features.

The case manifests and local test commands are included. The security cases are synthetic variants of a small set of templates, and the holdout was created by the same author; neither is an independent real-model evaluation. There are no real payments, no production authentication, and no live model or public hosting. I would appreciate feedback on the recovery state machine and on designing a stronger independent evaluation.

Project: [insert public repository URL only after publication]
Demo: [insert reviewed public demo link if available]

## GitHub Discussion, after Discussions is enabled

Title: `Feedback: failure states and independent evaluation for simulated agent actions`

What failure scenarios or invariants are missing from the local SQLite recovery lab? In particular, I would value feedback on how to model an ambiguous non-idempotent provider outcome without implying exactly-once guarantees. The current implementation intentionally leaves it unknown until externally verified. All payments and reviewers are test fixtures. Please refer to the documented limitations before interpreting results.

## AI engineering community post, after checking that community's posting rules

I built a local agent reliability experiment around a simulated invoice tool. It uses the OpenAI Agents SDK runner with a scripted model, plus a separate SQLite policy and approval gate. It tests a killed worker, competing processes, and a provider that drops or delays responses. Source and reproducible commands: [insert public link]. The unknown-outcome branch intentionally does not retry a non-idempotent operation automatically. I'd appreciate design feedback rather than treating this as a production-ready safety system.

Do not publish these posts while the repository is private and empty or imply that a live agent or real payment was tested. Show HN rules require something people can try and ask the creator to be available for discussion: https://news.ycombinator.com/showhn.html. GitHub Discussions visibility follows the repository: https://docs.github.com/en/discussions/quickstart. Choose relevant, specific communities after checking their current rules; do not mass-post.
