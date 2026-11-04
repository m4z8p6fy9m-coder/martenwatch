import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApp} from '../api/app.mjs';
import {createRecoveryEngine} from '../api/recovery.mjs';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

test('interrupted simulation resumes once after process restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledger-recovery-'));const path=join(dir,'test.sqlite');let app=buildApp({databasePath:path});
 try {let r=await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Demo',amountCents:100}});let id=r.json().id;await app.close();
 let db=new DatabaseSync(path);let engine=createRecoveryEngine(db);let job=engine.enqueue(id);assert.equal(engine.claim().id,job.id);db.close();
 app=buildApp({databasePath:path});assert.equal((await app.inject({url:'/health'})).json().recoveredOnStartup,1);
 await app.inject({method:'POST',url:`/api/invoices/${id}/simulate`});await app.inject({method:'POST',url:`/api/invoices/${id}/simulate`});
 const summary=(await app.inject({url:'/api/recovery'})).json();assert.equal(summary.simulatedEffects,1);assert.equal(summary.jobs.length,1);assert.equal(summary.jobs[0].state,'completed');assert.equal(summary.jobs[0].recovered,1);const events=(await app.inject({url:'/api/invoices'})).json().events;assert.equal(events.filter(e=>e.action==='Simulation abgeschlossen').length,1);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('a pending invoice cannot be executed',async()=>{const app=buildApp();try{let r=await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Demo',amountCents:250000}});assert.equal((await app.inject({method:'POST',url:`/api/invoices/${r.json().id}/simulate`})).statusCode,409);}finally{await app.close();}});

test('simulation handles only the requested job and reports an already running job as pending',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledger-target-job-'));const path=join(dir,'test.sqlite');const app=buildApp({databasePath:path});let db;
 try{
  const first=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'First',amountCents:100}})).json();
  const second=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Second',amountCents:100}})).json();
  const third=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Third',amountCents:100}})).json();
  db=new DatabaseSync(path);const engine=createRecoveryEngine(db);const other=engine.enqueue(first.id);const running=engine.enqueue(third.id);engine.claim(running.id);
  const response=await app.inject({method:'POST',url:`/api/invoices/${second.id}/simulate`});assert.equal(response.statusCode,200);
  assert.equal(engine.get(other.id).state,'queued');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM simulated_effects WHERE invoice_id=?').get(second.id).n,1);
  const pending=await app.inject({method:'POST',url:`/api/invoices/${third.id}/simulate`});assert.equal(pending.statusCode,202);assert.equal(pending.json().status,'in_progress');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM simulated_effects WHERE invoice_id=?').get(third.id).n,0);
 }finally{db?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('startup does not execute a forged pending job; review is still required',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledger-gate-'));const path=join(dir,'test.sqlite');let app=buildApp({databasePath:path});
 try{
  const invoice=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Unapproved test',amountCents:250000}})).json();await app.close();app=null;
  let db=new DatabaseSync(path);db.prepare("INSERT INTO jobs VALUES ('forged-job',?,'running',1,0,?)").run(invoice.id,new Date().toISOString());db.close();
  app=buildApp({databasePath:path});assert.equal((await app.inject({url:'/api/recovery'})).json().simulatedEffects,0);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/decision`,payload:{decision:'approve'}})).statusCode,200);await app.close();app=null;
  app=buildApp({databasePath:path});const result=(await app.inject({url:'/api/recovery'})).json();assert.equal(result.simulatedEffects,1);assert.equal(result.jobs[0].state,'completed');
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('a killed worker leaves a job that is resumed on startup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledger-kill-'));const path=join(dir,'test.sqlite');let app=buildApp({databasePath:path});let child;
 try {
  const invoice=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Kill test',amountCents:100}})).json();await app.close();app=null;
  const db=new DatabaseSync(path);createRecoveryEngine(db).enqueue(invoice.id);db.close();
  child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/interrupted-worker.mjs',import.meta.url)),path],{stdio:['ignore','pipe','pipe']});
  const [chunk]=await once(child.stdout,'data');assert.match(String(chunk),/CLAIMED/);const exited=once(child,'exit');child.kill();await exited;child=null;
  app=buildApp({databasePath:path});const health=(await app.inject({url:'/health'})).json();assert.equal(health.recoveredOnStartup,1);
  const summary=(await app.inject({url:'/api/recovery'})).json();assert.equal(summary.jobs[0].state,'completed');assert.equal(summary.jobs[0].attempts,2);assert.equal(summary.simulatedEffects,1);
 } finally {if(child)child.kill();if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('parallel worker processes claim each job once, even after repeated enqueue',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledger-workers-'));const path=join(dir,'test.sqlite');let app=buildApp({databasePath:path});
 try{
  const ids=[];for(let i=0;i<30;i++){const r=await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:`Parallel ${i}`,amountCents:100}});ids.push(r.json().id)}await app.close();app=null;
  let db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000');let engine=createRecoveryEngine(db);for(const id of ids){engine.enqueue(id);engine.enqueue(id)}db.close();
  const worker=fileURLToPath(new URL('./fixtures/drain-worker.mjs',import.meta.url));const run=promisify(execFile);const results=await Promise.all(Array.from({length:4},()=>run(process.execPath,[worker,path],{timeout:30000})));
  assert.equal(results.reduce((n,r)=>n+JSON.parse(r.stdout).completed,0),30);
  db=new DatabaseSync(path);const jobs=db.prepare('SELECT state,attempts FROM jobs').all();const effects=db.prepare('SELECT count(*) AS n FROM simulated_effects').get().n;const events=db.prepare("SELECT count(*) AS n FROM events WHERE action='Simulation abgeschlossen'").get().n;db.close();
  assert.equal(jobs.length,30);assert.ok(jobs.every(j=>j.state==='completed'&&j.attempts===1));assert.equal(effects,30);assert.equal(events,30);
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});
