import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {evaluateInvoice} from './policy.mjs';

// Single API instance only: startup recovery requeues running work. Do not scale replicas.
export async function buildPostgresApp({connectionString,agentProvider=null,logger=false,rateLimitMax=300}) {
  const pool=new pg.Pool({connectionString,connectionTimeoutMillis:10000});
  const app=Fastify({logger,bodyLimit:16384});
  app.register(rateLimit,{global:true,max:rateLimitMax,timeWindow:60000});
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS invoices (id UUID PRIMARY KEY, vendor TEXT NOT NULL, amount_cents BIGINT NOT NULL CHECK(amount_cents>=0), status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id UUID PRIMARY KEY, invoice_id UUID NOT NULL REFERENCES invoices(id), action TEXT NOT NULL, at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id UUID PRIMARY KEY, invoice_id UUID NOT NULL UNIQUE REFERENCES invoices(id), state TEXT NOT NULL CHECK(state IN ('queued','running','completed')), attempts INTEGER NOT NULL DEFAULT 0, recovered BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS simulated_effects (invoice_id UUID PRIMARY KEY REFERENCES invoices(id), completed_at TIMESTAMPTZ NOT NULL);`);
    var recoveredOnStartup=(await pool.query("UPDATE jobs SET state='queued', recovered=true WHERE state='running'")).rowCount;
  } catch(error){await pool.end();throw error;}
  const transaction=async fn=>{const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
  // Single-instance recovery of persisted simulation jobs; the effect and completion commit together.
  while(await transaction(async client=>{const job=(await client.query("SELECT j.id,j.invoice_id FROM jobs j JOIN invoices i ON i.id=j.invoice_id WHERE j.state='queued' AND i.status IN ('processed','approved') ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED")).rows[0];if(!job)return false;await client.query("UPDATE jobs SET state='running',attempts=attempts+1 WHERE id=$1",[job.id]);const effect=await client.query('INSERT INTO simulated_effects VALUES ($1,$2) ON CONFLICT(invoice_id) DO NOTHING',[job.invoice_id,new Date()]);if(effect.rowCount)await client.query('INSERT INTO events VALUES ($1,$2,$3,$4)',[randomUUID(),job.invoice_id,'Simulation abgeschlossen',new Date()]);await client.query("UPDATE jobs SET state='completed' WHERE id=$1",[job.id]);return true;})){}
  app.addHook('onClose',async()=>pool.end());
  app.register(async function routes(app) {
  app.get('/health',async()=>({status:'ok',storage:'postgresql',agent:agentProvider?'configured':'not-connected',recoveredOnStartup}));
  app.get('/api/metrics',async()=>({requests:null,errors:null,meanDurationMs:null,scope:'not-instrumented',modelTokens:null,modelCost:null}));
  app.get('/api/invoices',async()=>({agent:agentProvider?'configured':'not-connected',invoices:(await pool.query('SELECT id,vendor,amount_cents::float8 AS "amountCents",status,created_at AS "createdAt" FROM invoices ORDER BY created_at DESC,id DESC LIMIT 500')).rows,events:(await pool.query('SELECT id,invoice_id AS "invoiceId",action,at FROM events ORDER BY at DESC,id DESC LIMIT 500')).rows}));
  app.get('/api/recovery',async()=>({jobs:(await pool.query('SELECT id,invoice_id AS "invoiceId",state,attempts,recovered FROM jobs ORDER BY created_at DESC LIMIT 500')).rows,simulatedEffects:Number((await pool.query('SELECT count(*) FROM simulated_effects')).rows[0].count)}));
  app.post('/api/invoices',async(req,reply)=>{const {vendor,amountCents}=req.body??{};if(typeof vendor!=='string'||!vendor.trim()||vendor.trim().length>120)return reply.code(400).send({error:'Invalid vendor'});let status;try{status=evaluateInvoice(amountCents)}catch{return reply.code(400).send({error:'Invalid amount'})}const invoice={id:randomUUID(),vendor:vendor.trim(),amountCents,status,createdAt:new Date().toISOString()};await transaction(async client=>{await client.query('INSERT INTO invoices VALUES ($1,$2,$3,$4,$5)',Object.values(invoice));await client.query('INSERT INTO events VALUES ($1,$2,$3,$4)',[randomUUID(),invoice.id,status==='pending_approval'?'Freigabe erforderlich':'Simulation verarbeitet',invoice.createdAt]);});return reply.code(201).send(invoice);});
  app.post('/api/invoices/:id/decision',async(req,reply)=>{if(!['approve','reject'].includes(req.body?.decision))return reply.code(400).send({error:'Invalid decision'});const outcome=await transaction(async client=>{let {rows}=await client.query('SELECT id,vendor,amount_cents::float8 AS "amountCents",status,created_at AS "createdAt" FROM invoices WHERE id::text=$1 FOR UPDATE',[req.params.id]);let invoice=rows[0];if(!invoice)return {code:404,error:'Not found'};if(invoice.status!=='pending_approval')return {code:409,error:'Not awaiting approval'};invoice.status=req.body.decision==='approve'?'approved':'rejected';await client.query('UPDATE invoices SET status=$1 WHERE id=$2',[invoice.status,invoice.id]);await client.query('INSERT INTO events VALUES ($1,$2,$3,$4)',[randomUUID(),invoice.id,invoice.status==='approved'?'Simulation freigegeben':'Simulation abgelehnt',new Date()]);return {invoice};});return outcome.error?reply.code(outcome.code).send({error:outcome.error}):outcome.invoice;});
  app.post('/api/invoices/:id/analyze',async(req,reply)=>{let {rows}=await pool.query('SELECT id,vendor,amount_cents::float8 AS "amountCents",status FROM invoices WHERE id::text=$1',[req.params.id]);if(!rows[0])return reply.code(404).send({error:'Not found'});if(!agentProvider)return reply.code(503).send({error:'Foundry is not configured'});try{return {analysis:await agentProvider.analyzeInvoice(rows[0]),policyStatus:rows[0].status}}catch(error){req.log.error({errorType:error.name},'Agent analysis failed');return reply.code(502).send({error:'Agent analysis failed'});}});
  app.post('/api/invoices/:id/simulate',async(req,reply)=>{
    const result=await transaction(async client=>{
      const invoice=(await client.query('SELECT id,status FROM invoices WHERE id::text=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!invoice)return {code:404,error:'not_found'};
      if(!['processed','approved'].includes(invoice.status))return {code:409,error:'approval_required'};
      await client.query("INSERT INTO jobs VALUES ($1,$2,'queued',0,false,$3) ON CONFLICT(invoice_id) DO NOTHING",[randomUUID(),invoice.id,new Date()]);
      // Lock and handle the job for this invoice only, never a different queued job.
      const job=(await client.query('SELECT id,invoice_id,state FROM jobs WHERE invoice_id=$1 FOR UPDATE',[invoice.id])).rows[0];
      if(job.state==='running')return {pending:true};
      if(job.state==='completed')return {};
      await client.query("UPDATE jobs SET state='running',attempts=attempts+1 WHERE id=$1",[job.id]);
      const effect=await client.query('INSERT INTO simulated_effects VALUES ($1,$2) ON CONFLICT(invoice_id) DO NOTHING',[invoice.id,new Date()]);
      if(effect.rowCount)await client.query('INSERT INTO events VALUES ($1,$2,$3,$4)',[randomUUID(),invoice.id,'Simulation abgeschlossen',new Date()]);
      await client.query("UPDATE jobs SET state='completed' WHERE id=$1",[job.id]);
      return {};
    });
    if(result.error)return reply.code(result.code).send({error:result.error});
    const summary={jobs:(await pool.query('SELECT id,invoice_id AS "invoiceId",state,attempts,recovered FROM jobs ORDER BY created_at DESC LIMIT 500')).rows,simulatedEffects:Number((await pool.query('SELECT count(*) FROM simulated_effects')).rows[0].count)};
    if(result.pending)return reply.code(202).send({status:'in_progress',...summary});
    return summary;
  });
  });
  return app;
}
