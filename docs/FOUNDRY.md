# Microsoft Foundry integration (offline-first)

ActionLedger can construct a Foundry agent Responses endpoint from a project endpoint and an agent name. The adapter uses Azure `DefaultAzureCredential` and requests the `https://ai.azure.com/.default` token scope. It sends only a synthetic invoice analysis request. Model text is advisory; policy and approval remain server decisions. No real model call, Azure deployment, permissions or costs have been validated from this application.

## Current cost boundary

The provider is **disabled by default**, including when an endpoint and agent name are present. The server only instantiates it when `FOUNDRY_ENABLE_PAID_CALLS=true` and both configuration values exist. Merely constructing the provider does not make a model call; a call occurs only on the analysis endpoint. Tests use mock credentials and mock HTTP only, and CI must never enable the flag or include cloud credentials. A flag is not a spending cap or Azure budget. Do not enable live calls until account ownership, organizational permission, model pricing, deployment and applicable hard spending restrictions have been verified and the account holder has explicitly requested the call. The current demo has no authenticated reviewer or internet-ready access controls.

## Endpoint, identity and data

Only an HTTPS endpoint in the documented public `*.services.ai.azure.com` project format, without custom ports, credentials, query or fragment, is accepted. Redirects are rejected and calls time out after 30 seconds. User-defined content and model responses are untrusted. Invoice fields are serialized as JSON with a separate task description; this separation is not a guarantee against prompt injection. Input is validated before acquiring credentials. Provider responses are streamed with a 128 KiB limit and malformed, incomplete or unusable results are rejected. No automatic retry is made. Token counts are accepted only as nonnegative safe integers; unknown usage and estimated cost are shown as unknown. Errors returned to API clients do not include provider bodies, access tokens or exception messages. DefaultAzureCredential can use several local or deployed identity sources; a later deployment should use an explicitly managed identity, least-privilege Azure RBAC and a private secret-free configuration. These controls are not yet proven against a real Foundry resource. The allowlist does not support sovereign clouds, private-link endpoint formats or Foundry Agent Applications; it supports the agent endpoint pattern only.

## Reproduce without cost

```sh
npm ci
node --test tests/foundry.test.mjs
npm run demo:showcase
```

The Foundry tests verify endpoint validation, disabled-by-default behavior, mock model responses, redirect policy and policy independence. A simulated response containing a tool call is rejected even when it also contains valid text; refusals, partial responses and non-assistant output also fail closed. An end-to-end offline test verifies a malicious tool request cannot grant approval or create a simulated effect when the test identity adapter is enabled. These fixtures exercise protocol handling and server authorization, not the behavior of a real model or Foundry service. Strict output checks may need adjustment after a deliberately authorized live compatibility test. Run `npm run eval:local` to include these tests with the local evaluation. The SDK demo uses a scripted model and is separate from Foundry. `GET /api/telemetry` provides bounded local traces for model calls on the SQLite API path; those spans disappear on process restart and no Azure Monitor exporter is configured.

## Future Azure work, not deployed

A future live setup requires an appropriate Microsoft Foundry project and agent endpoint, a permitted identity and a deliberately enabled model. Before public access, implement and verify real authentication, authorization, tenant boundaries, CSRF defenses, secure network ingress, durable and privacy-reviewed monitoring, production data retention, and operational incident response. PostgreSQL passed a disposable GitHub Actions integration test; Azure PostgreSQL has not been verified. No IaC deployment, Databricks, Azure Monitor service or hosted public endpoint is provisioned by this guide.

References: [Foundry agent endpoint protocols](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/configure-agent), [agent endpoint authorization](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/configure-agent-endpoint-authorization), and [Agent Applications](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/agent-applications). Consult current Microsoft pricing and the actual account's spending limits before any live call.
