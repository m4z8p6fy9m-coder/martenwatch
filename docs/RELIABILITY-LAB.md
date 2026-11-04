# Agent reliability challenges lab

Run `npm run lab:reliability` with Node 24. The lab uses only temporary SQLite files, synthetic invoices and a local HTTP provider on 127.0.0.1. It does not call Foundry, OpenAI or payment services. On restricted machines, loopback HTTP may be blocked by the execution sandbox; run where local loopback is permitted. CI runs the tests through `npm test`.

## Two distinct models

The existing local simulation stores both its effect and job completion transactionally in SQLite, with a unique invoice constraint. Its recovery tests start real worker processes, terminate one after a claim, restart, and run competing worker processes. These guarantees only describe the simulated local effect.

The new `api/external-reliability-lab.mjs` models a non-idempotent external provider. Its durable states are `ready -> dispatching -> completed` on a confirmed response, or `dispatching -> unknown` on timeout, disconnection or an interrupted process. Unknown is never automatically retried. An operator can record either `confirmed_executed` (complete without another call) or `confirmed_not_executed` (permit a new attempt) only after independently establishing the outcome. This reconciliation method is a lab fixture, not a production authenticated review feature.

The crucial limitation: the external provider may have performed its effect before the response disappears. SQLite cannot atomically commit with a separate non-idempotent provider. The lab does not claim exactly-once external execution or prove that arbitrary external systems are safe. If evidence is insufficient, the correct state remains `unknown`; it must not be retried automatically. Provider-supported idempotency keys and trustworthy status lookup would permit stronger recovery if their actual contracts are verified.

## Automated experiments

- A local fake provider records a simulated effect; the worker is forcibly killed before any response. Three database reopenings preserve `unknown`, and repeated dispatch calls make no second provider call. Reconciliation records a confirmed effect.
- The provider records an effect and then drops the TCP connection or delays the response beyond the timeout. Both results are `unknown` and do not automatically retry.
- Two separate OS processes race to claim the same action. SQLite transaction locking admits one claim. After both processes have exited, recovery marks the abandoned claim unknown.
- An unapproved invoice cannot create a dispatchable action; a policy change after queuing is also rechecked at claim. A controlled retry only follows a fixture assertion that the prior action definitely did not execute.

The test suite counts simulated effects and checks durable local events and states; it is evidence for these controlled scenarios, not proof about production systems or all failures. The artificial network failure is a connection reset or no response from a loopback fake, not a machine-wide network outage. The provider count in the tests is independent of the ledger, but is an in-memory test fixture and not an external audit. The separate OpenAI SDK example is not wired into this external-provider lab.

## Concurrency and safety limitations

`recoverAfterWorkersStopped` is safe only when all earlier worker processes are confirmed stopped. The experiment does not implement leases, fencing tokens, heartbeat, multi-host coordination, authenticated reconciliation, production credentials, immutable auditing or PostgreSQL integration. Never attach the lab to real payments or invoke recovery concurrently with live workers. It is not wired into normal app startup and does not change the existing local simulation's recovery behavior.
