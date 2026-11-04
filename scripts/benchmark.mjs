import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {buildApp} from '../api/app.mjs';
import {createRecoveryEngine} from '../api/recovery.mjs';

const dir=mkdtempSync(join(tmpdir(),'ledger-benchmark-'));const path=join(dir,'demo.sqlite');let app=buildApp({databasePath:path});
const counts={total:100,blocked:0,completed:0,recovered:0,duplicateEffects:0,unexpectedErrors:0};const started=performance.now();const latencies=[];const inject=async request=>{const start=performance.now();try{return await app.inject(request)}finally{latencies.push(performance.now()-start)}};const percentile=(sorted,p)=>Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]*100)/100;
try {
 for(let i=0;i<100;i++) {let r=await inject({method:'POST',url:'/api/invoices',payload:{vendor:`Demo ${i+1}`,amountCents:i%4===0?250000:10000}});if(r.statusCode!==201){counts.unexpectedErrors++;continue}const invoice=r.json();if(invoice.status==='pending_approval'){let blocked=await inject({method:'POST',url:`/api/invoices/${invoice.id}/simulate`});if(blocked.statusCode===409)counts.blocked++;else counts.unexpectedErrors++;}else {let result=await inject({method:'POST',url:`/api/invoices/${invoice.id}/simulate`});if(result.statusCode!==200)counts.unexpectedErrors++;}}
 await app.close();
 // Reopen ten completed jobs as interrupted work to exercise replay after a simulated process interruption.
 let db=new DatabaseSync(path);db.exec("UPDATE jobs SET state='running' WHERE id IN (SELECT id FROM jobs WHERE state='completed' ORDER BY rowid LIMIT 10)");db.close();
 app=buildApp({databasePath:path});counts.recovered=(await app.inject({url:'/health'})).json().recoveredOnStartup;
 db=new DatabaseSync(path);const engine=createRecoveryEngine(db);let job;while((job=engine.claim()))engine.finish(job.id);db.close();
 const summary=(await app.inject({url:'/api/recovery'})).json();counts.completed=summary.jobs.filter(j=>j.state==='completed').length;counts.duplicateEffects=Math.max(0,summary.simulatedEffects-counts.completed);
 latencies.sort((a,b)=>a-b);console.log(JSON.stringify({benchmarkVersion:'1',workload:'100 invoices, every fourth blocked, 10 synthetic interruptions',runtime:process.version,platform:process.platform,arch:process.arch,...counts,requestsMeasured:latencies.length,p50Ms:percentile(latencies,0.50),p95Ms:percentile(latencies,0.95),elapsedMs:Math.round(performance.now()-started),note:'Local synthetic simulation; no model calls, external payments, cloud latency, or real process kill.'},null,2));
 if(counts.blocked!==25||counts.completed!==75||counts.recovered!==10||counts.duplicateEffects!==0||counts.unexpectedErrors!==0)process.exitCode=1;
} finally {await app.close();rmSync(dir,{recursive:true,force:true});}
