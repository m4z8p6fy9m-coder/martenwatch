import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { evaluateInvoice } from './policy.mjs';
import { createRecoveryEngine } from './recovery.mjs';
import { permissionFor, isAllowed } from './security.mjs';
import { createLocalTelemetry } from './telemetry.mjs';

export function buildApp({ databasePath = ':memory:', logger = false, agentProvider = null, authenticate = null, requireIdentity = false, rateLimitMax = 300 } = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, vendor TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), action TEXT NOT NULL, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_invoice ON events(invoice_id);
    CREATE TABLE IF NOT EXISTS workflow_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL REFERENCES invoices(id), stage TEXT NOT NULL, outcome TEXT NOT NULL, trace_id TEXT, span_id TEXT, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS workflow_events_invoice ON workflow_events(invoice_id,seq);`);
  const app = Fastify({logger, bodyLimit: 16384});
  app.register(rateLimit, {global:true, max:rateLimitMax, timeWindow:60000});
  app.register(async function routes(app) {
  const telemetry = createLocalTelemetry();
  app.addHook('onRequest',async(req)=>{req.localSpan=telemetry.startRequest(req.method,req.routeOptions.url ?? 'unmatched');});
  app.addHook('preHandler',async(req,reply)=>{if(!requireIdentity)return;const permission=permissionFor(req.method,req.routeOptions.url);if(!permission)return;const principal=authenticate?await authenticate(req):null;if(!principal){telemetry.recordSecurity(permission,'unauthenticated',req.localSpan);return reply.code(401).send({error:'Authentication required'});}if(!isAllowed(principal,permission)){telemetry.recordSecurity(permission,'forbidden',req.localSpan);return reply.code(403).send({error:'Forbidden'});}telemetry.recordSecurity(permission,'allowed',req.localSpan);});
  const recovery = createRecoveryEngine(db);
  const recoveredOnStartup = recovery.recover();
  telemetry.event('recovery.startup',{recovered:recoveredOnStartup});
  let recoveredJob;
  while ((recoveredJob = recovery.claim())) recovery.finish(recoveredJob.id);
  const metrics = {requests:0,errors:0,totalDurationMs:0};
  app.addHook('onResponse', async (request, reply) => {metrics.requests++; if(reply.statusCode>=500) metrics.errors++; metrics.totalDurationMs+=reply.elapsedTime;telemetry.endRequest(request.localSpan,reply.statusCode,reply.elapsedTime);});
  const insertEvent = db.prepare('INSERT INTO events (id, invoice_id, action, at) VALUES (?, ?, ?, ?)');
  const addEvent = (invoiceId, action, at) => insertEvent.run(randomUUID(), invoiceId, action, at);
  const addWorkflow = (id,stage,outcome,span) => {const sc=span?.spanContext();db.prepare('INSERT INTO workflow_events (invoice_id,stage,outcome,trace_id,span_id,at) VALUES (?,?,?,?,?,?)').run(id,stage,outcome,sc?.traceId??null,sc?.spanId??null,new Date().toISOString());telemetry.event(stage,{outcome},span);};
  const transaction = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  app.addHook('onClose', async () => {db.close();await telemetry.close();});
  app.get('/health', async () => ({status:'ok',storage:'sqlite-local',agent:agentProvider?'configured':'not-connected',recoveredOnStartup}));
  app.post('/api/invoices/:id/analyze', async (req,reply) => {
    const invoice=db.prepare('SELECT id, vendor, amount_cents AS amountCents, status FROM invoices WHERE id=?').get(req.params.id);
    if(!invoice)return reply.code(404).send({error:'Not found'});
    if(!agentProvider)return reply.code(503).send({error:'Foundry is not configured'});
    try { const result=await telemetry.modelCall(()=>agentProvider.analyzeInvoice(invoice),req.localSpan); addWorkflow(invoice.id,'agent.analysis','completed',req.localSpan);return {analysis:result,policyStatus:invoice.status}; }
    catch(error){addWorkflow(invoice.id,'agent.analysis','error',req.localSpan);req.log.error({errorType:error.name},'Agent analysis failed');return reply.code(502).send({error:'Agent analysis failed'});}
  });
  app.get('/api/metrics', async () => ({...metrics,meanDurationMs:metrics.requests ? Math.round(metrics.totalDurationMs/metrics.requests*100)/100 : null,scope:'current process',modelTokens:null,modelCost:null}));
  app.get('/api/telemetry', async () => telemetry.snapshot());
  app.get('/api/workflows/:id', async (req,reply) => {const exists=db.prepare('SELECT id FROM invoices WHERE id=?').get(req.params.id);if(!exists)return reply.code(404).send({error:'Not found'});return {workflowId:exists.id,events:db.prepare('SELECT seq,stage,outcome,trace_id AS traceId,span_id AS spanId,at FROM workflow_events WHERE invoice_id=? ORDER BY seq LIMIT 1000').all(exists.id),scope:'sqlite-local'};});
  app.get('/api/recovery', async () => recovery.summary());
  app.post('/api/invoices/:id/simulate', async (req,reply) => {
    const result = recovery.enqueue(req.params.id);
    if(result.error){telemetry.recordSecurity('execute',result.error,req.localSpan);if(result.error!=='not_found')addWorkflow(req.params.id,'execution.gate',result.error,req.localSpan);return reply.code(result.error==='not_found'?404:409).send(result);}
    addWorkflow(req.params.id,'execution.gate','allowed',req.localSpan);
    const job = recovery.claim(result.id);
    if(job){const result=recovery.finish(job.id);if(result.error){telemetry.recordSecurity('execute',result.error,req.localSpan);addWorkflow(job.invoice_id,'execution.simulated',result.error,req.localSpan);return reply.code(409).send({error:result.error});}addWorkflow(job.invoice_id,'execution.simulated','completed',req.localSpan);telemetry.event('simulation.completed',{},req.localSpan);}
    if(!job && recovery.get(result.id)?.state!=='completed')return reply.code(202).send({status:'in_progress',...recovery.summary()});
    return recovery.summary();
  });
  app.get('/api/invoices', async () => ({
    agent:agentProvider?'configured':'not-connected',
    invoices: db.prepare('SELECT id, vendor, amount_cents AS amountCents, status, created_at AS createdAt FROM invoices ORDER BY created_at DESC, rowid DESC LIMIT 500').all(),
    events: db.prepare('SELECT id, invoice_id AS invoiceId, action, at FROM events ORDER BY at DESC, rowid DESC LIMIT 500').all()
  }));
  app.post('/api/invoices', async (req, reply) => {
    const {vendor, amountCents} = req.body ?? {};
    if (typeof vendor !== 'string' || !vendor.trim() || vendor.trim().length > 120) return reply.code(400).send({error:'Invalid vendor'});
    let status; try { status = evaluateInvoice(amountCents); } catch { return reply.code(400).send({error:'Invalid amount'}); }
    const invoice = {id:randomUUID(),vendor:vendor.trim(),amountCents,status,createdAt:new Date().toISOString()};
    transaction(() => { db.prepare('INSERT INTO invoices VALUES (?, ?, ?, ?, ?)').run(invoice.id,invoice.vendor,amountCents,status,invoice.createdAt); addEvent(invoice.id,status === 'pending_approval' ? 'Freigabe erforderlich' : 'Simulation verarbeitet',invoice.createdAt);addWorkflow(invoice.id,'policy.invoice',status,req.localSpan); });
    return reply.code(201).send(invoice);
  });
  app.post('/api/invoices/:id/decision', async (req, reply) => {
    const decision = req.body?.decision;
    if (!['approve','reject'].includes(decision)) return reply.code(400).send({error:'Invalid decision'});
    const outcome = transaction(() => {
      const current = db.prepare('SELECT id, vendor, amount_cents AS amountCents, status, created_at AS createdAt FROM invoices WHERE id = ?').get(req.params.id);
      if (!current) return {code:404,error:'Not found'};
      if (current.status !== 'pending_approval') return {code:409,error:'Not awaiting approval'};
      const status = decision === 'approve' ? 'approved' : 'rejected';
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status,current.id);
      addEvent(current.id,status === 'approved' ? 'Simulation freigegeben' : 'Simulation abgelehnt',new Date().toISOString());
      addWorkflow(current.id,'approval.decision',status,req.localSpan);
      return {invoice:{...current,status}};
    });
    telemetry.recordSecurity('review',outcome.error??outcome.invoice.status,req.localSpan);
    return outcome.error ? reply.code(outcome.code).send({error:outcome.error}) : outcome.invoice;
  });
  });
  return app;
}
