import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';

// This factory exposes no network transport or identity provider. Its caller
// supplies a trusted gateway bound to the application's authorization policy.
export function createLedgerMcpServer({callTool}) {
  if (typeof callTool !== 'function') throw new Error('Trusted tool gateway required');
  const server = new McpServer({name:'actionledger-local',version:'0.1.0'});
  server.registerTool('simulate_invoice', {
    description:'Request a simulated invoice action through ActionLedger. A reviewer must approve invoices above the policy threshold. No real payment occurs.',
    inputSchema:z.object({invoiceId:z.string().uuid()}).strict(),
    outputSchema:z.object({status:z.enum(['completed','pending','blocked','denied','error']),httpStatus:z.number().int().optional(),reason:z.string().optional(),simulated:z.boolean().optional()}).strict(),
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true}
  }, async args => {
    let result;
    try { result=await callTool('simulate_invoice',args); }
    catch { result={status:'error',reason:'tool_unavailable',simulated:true}; }
    return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:!['completed','pending'].includes(result.status)};
  });
  return server;
}
