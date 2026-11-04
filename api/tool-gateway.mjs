// Local, simulated tool boundary. This is not an MCP protocol server and the
// caller identity is supplied by trusted application code, never tool input.
const invoiceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createToolGateway({app, authorization}) {
  if (!app || typeof app.inject !== 'function' || typeof authorization !== 'string' || !authorization) throw new Error('Trusted application and identity required');
  return async function callTool(name, args) {
    if (name !== 'simulate_invoice') return {status:'denied', reason:'unknown_tool'};
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 || typeof args.invoiceId !== 'string' || !invoiceIdPattern.test(args.invoiceId)) return {status:'denied', reason:'invalid_arguments'};
    const response = await app.inject({method:'POST',url:`/api/invoices/${args.invoiceId}/simulate`,headers:{authorization}});
    if (response.statusCode === 200) return {status:'completed', httpStatus:200, simulated:true};
    if (response.statusCode === 202) return {status:'pending', httpStatus:202, simulated:true};
    if (response.statusCode === 409) return {status:'blocked', httpStatus:409, simulated:true};
    if (response.statusCode === 401 || response.statusCode === 403) return {status:'denied', httpStatus:response.statusCode, simulated:true};
    return {status:'error', httpStatus:response.statusCode, simulated:true};
  };
}
