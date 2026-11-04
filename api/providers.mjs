// Provider adapters return observations only. The deterministic gateway always decides independently.
export class AgentProvider {
  async analyzeInvoice(_invoice) { throw new Error('AgentProvider.analyzeInvoice must be implemented'); }
}
export class DemoProvider extends AgentProvider {
  async analyzeInvoice(invoice) { return {provider:'demo',summary:`Simulated invoice for ${invoice.vendor}`,inputTokens:null,outputTokens:null,estimatedCost:null}; }
}
