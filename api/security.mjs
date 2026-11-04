export function permissionFor(method,route) {
  if ((method==='GET'||method==='HEAD') && route==='/health') return null;
  if ((method==='GET'||method==='HEAD') && ['/api/invoices','/api/recovery','/api/metrics','/api/telemetry'].includes(route)) return 'read';
  if ((method==='GET'||method==='HEAD') && route==='/api/workflows/:id') return 'read';
  if (method==='POST' && route==='/api/invoices/:id/decision') return 'review';
  if (method==='POST' && route==='/api/invoices/:id/simulate') return 'execute';
  if (method==='POST' && route==='/api/invoices/:id/analyze') return 'analyze';
  if (method==='POST' && route==='/api/invoices') return 'create';
  return 'deny';
}
const permissions={reviewer:new Set(['read','review','analyze','create']),operator:new Set(['read','execute','analyze','create']),agent:new Set(['analyze'])};
export function isAllowed(principal,permission) { return Boolean(principal && Array.isArray(principal.roles) && principal.roles.some(role=>permissions[role]?.has(permission))); }
