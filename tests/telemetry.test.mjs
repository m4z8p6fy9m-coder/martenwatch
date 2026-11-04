import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../api/app.mjs';

test('local OpenTelemetry captures request spans and metrics without invoice contents',async()=>{
 const app=buildApp();try{
  await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'PRIVATE-TEST-VENDOR',amountCents:100}});
  let r=await app.inject({url:'/api/telemetry'});let data=r.json();
  assert.equal(data.scope,'local-memory-only');assert.ok(data.traces.some(s=>s.name==='http.request'&&s.attributes['http.response.status_code']===201));
  assert.ok(data.metrics.some(m=>m.name==='actionledger.http.requests'));assert.ok(data.metrics.some(m=>m.name==='actionledger.process.memory.rss'&&m.dataPoints.some(p=>p.value>0)));assert.ok(data.metrics.some(m=>m.name==='actionledger.process.cpu.time'&&m.dataPoints.length===2));assert.ok(!JSON.stringify(data).includes('PRIVATE-TEST-VENDOR'));
 }finally{await app.close()}
});

test('agent errors and policy blocks produce correlated local traces without prompt contents',async()=>{
 const app=buildApp({agentProvider:{analyzeInvoice:async()=>{throw new Error('SECRET-PROMPT-DETAIL')}}});try{
  const invoice=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Demo',amountCents:250000}})).json();
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/analyze`})).statusCode,502);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/simulate`})).statusCode,409);
  const data=(await app.inject({url:'/api/telemetry'})).json();const span=data.traces.find(s=>s.name==='agent.analysis');
  assert.ok(span);assert.equal(span.status.code,2);assert.ok(data.traces.some(s=>s.name==='http.request'&&s.traceId===span.traceId&&s.spanId===span.parentSpanId));
  assert.ok(data.traces.some(s=>s.name==='security.decision'&&s.attributes.outcome==='approval_required'));
  assert.ok(data.metrics.some(m=>m.name==='actionledger.model.calls'));assert.ok(!JSON.stringify(data).includes('SECRET-PROMPT-DETAIL'));
 }finally{await app.close()}
});

test('structured workflow events connect analysis, policy, approval and simulation across restart',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'ledger-trace-'));let app;
 const path=join(dir,'trace.sqlite');try{
  app=buildApp({databasePath:path,agentProvider:{analyzeInvoice:async()=>({summary:'PRIVATE-AGENT-CONTENT'})}});
  const invoice=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'PRIVATE-SUPPLIER',amountCents:250000}})).json();
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/analyze`})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/simulate`})).statusCode,409);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/decision`,payload:{decision:'approve'}})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/simulate`})).statusCode,200);
  const spans=(await app.inject({url:'/api/telemetry'})).json().traces;assert.ok(spans.some(s=>s.name==='policy.invoice'));assert.ok(spans.some(s=>s.name==='approval.decision'));assert.ok(spans.some(s=>s.name==='execution.simulated'));
  await app.close();app=buildApp({databasePath:path});const response=await app.inject({url:`/api/workflows/${invoice.id}`});assert.equal(response.statusCode,200);const body=response.json();
  assert.deepEqual(body.events.map(e=>[e.stage,e.outcome]),[['policy.invoice','pending_approval'],['agent.analysis','completed'],['execution.gate','approval_required'],['approval.decision','approved'],['execution.gate','allowed'],['execution.simulated','completed']]);
  assert.ok(body.events.every(e=>/^[a-f0-9]{32}$/.test(e.traceId)&&/^[a-f0-9]{16}$/.test(e.spanId)));
  assert.ok(!JSON.stringify(body).includes('PRIVATE-SUPPLIER'));assert.ok(!JSON.stringify(body).includes('PRIVATE-AGENT-CONTENT'));
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true})}
});

test('workflow event read obeys test identity permissions',async()=>{
 const auth=async req=>({operator:{roles:['operator']},agent:{roles:['agent']}}[req.headers.authorization]??null);const app=buildApp({requireIdentity:true,authenticate:auth});
 try{const invoice=(await app.inject({method:'POST',url:'/api/invoices',headers:{authorization:'operator'},payload:{vendor:'Synthetic',amountCents:100}})).json();
 assert.equal((await app.inject({url:`/api/workflows/${invoice.id}`})).statusCode,401);
 assert.equal((await app.inject({url:`/api/workflows/${invoice.id}`,headers:{authorization:'agent'}})).statusCode,403);
 assert.equal((await app.inject({url:`/api/workflows/${invoice.id}`,headers:{authorization:'operator'}})).statusCode,200);
 }finally{await app.close()}
});
