# Offline multicloud experiments

No AWS or Databricks account, resource, credential, live service or bill is connected. No school data is needed. These are local preparation and synthetic examples, not production integrations.

## Bedrock contract

`api/bedrock-provider.mjs` accepts an injected `invoke` function matching the shape of an Amazon Bedrock Converse request and an explicit model ID. It has no AWS SDK, credential discovery, transport, environment activation or live application configuration. Tests supply a mock and verify that advisory model text cannot override the existing server-side invoice gate. Unexpected tool calls and incomplete output fail closed. The abstraction does not make a real model call and has not been verified with AWS.

Run `node --test tests/bedrock-provider.test.mjs`. A future integration would need the official AWS SDK, short-lived role credentials, authorization, privacy review and explicit cost approval; merely supplying `modelId` does not establish a connection. The mock does not establish the full Bedrock API behavior or provide a hard cost limit. See the [AWS Converse API documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html).

## Databricks example

`docs/DATABRICKS-DEMO.sql` is a self-contained illustrative query over five synthetic rows. It does not ingest ActionLedger events, calculate actual cloud costs, connect to a warehouse or validate Databricks behavior. A future pipeline needs an explicit data contract, access controls, retention, privacy review, cost controls and tests against an authorized workspace before handling anything other than synthetic data. Do not upload school data or real credentials.
