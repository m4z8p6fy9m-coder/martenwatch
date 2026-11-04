# Demo recording plan (about 75 seconds)

Only synthetic data is used. Before recording, hide notifications, close unrelated tabs and apps, and avoid showing personal accounts, school information, API keys or browser bookmarks. Record a terminal window only. Do not show actual invoices. No recording is included in this draft.

1. (0–10s) Title card: “ActionLedger: testing approval and recovery for simulated agent tool calls.” Say the model is a scripted test double and no payments occur.
2. (10–40s) Run `npm run demo:showcase`. Explain: a EUR 2,500 invoice enters pending review; the real Agents SDK pauses for its own approval; after the test approves that SDK interruption, the separate ledger gate still blocks it. A fake reviewer approves the ledger, then a second scripted SDK run completes one simulated effect.
3. (40–60s) Show the final `after_restart` event list. Explain that SQLite event records persist while OpenTelemetry spans are only stored in memory. This is not one persistent cross-service OpenTelemetry trace.
4. (60–75s) Run `npm run lab:reliability` (or show its completed output). Explain that local tests kill worker processes, race workers and simulate dropped or delayed provider responses. For non-idempotent external services the outcome is explicitly marked unknown and is not retried automatically.

No real OpenAI model, Foundry service, external payment or cloud is used. SDK approval and ledger review are simulated test actions, not verified human identity. The external-provider lab and SDK demonstration are separate. After recording, inspect the complete video and audio before sharing. Do not show a private repository URL as though it is publicly accessible.
