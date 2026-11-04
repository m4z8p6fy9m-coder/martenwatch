-- Standalone synthetic demonstration. No ActionLedger data, cloud account or
-- real billing data is connected. This SQL has not been run in Databricks.
WITH workflow_events(stage, outcome) AS (
  SELECT * FROM VALUES
    ('policy.invoice', 'pending_approval'),
    ('execution.gate', 'approval_required'),
    ('approval.decision', 'approved'),
    ('execution.simulated', 'completed'),
    ('agent.analysis', 'error')
)
SELECT stage, outcome, COUNT(*) AS event_count
FROM workflow_events
GROUP BY stage, outcome
ORDER BY stage, outcome;
