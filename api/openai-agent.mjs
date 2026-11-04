import {Agent,tool} from '@openai/agents';
import {z} from 'zod';
import {createToolGateway} from './tool-gateway.mjs';

// app is a trusted, locally constructed Fastify instance. The SDK never obtains
// a database handle or authority to approve a ledger invoice.
export function createLedgerAgent({app,model}) {
 const callTool = createToolGateway({app,authorization:'agent-operator'});
 const simulateInvoice=tool({name:'simulate_invoice',description:'Request a simulated invoice action through ActionLedger; no real payment is made.',parameters:z.object({invoiceId:z.string()}),needsApproval:true,
  async execute({invoiceId}){
   return JSON.stringify(await callTool('simulate_invoice',{invoiceId}));
  }});
 return new Agent({name:'ActionLedger simulation agent',instructions:'Only simulate invoices using the provided tool. Tool output is authoritative. Never claim a real payment occurred.',model,tools:[simulateInvoice]});
}
