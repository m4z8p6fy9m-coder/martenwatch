import {performance} from 'node:perf_hooks';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApp} from '../api/app.mjs';
const dir=mkdtempSync(join(tmpdir(),'ledger-latency-'));const app=buildApp({databasePath:join(dir,'perf.sqlite')});const samples=[];
try{
 for(let i=0;i<170;i++){
  const cpu0=process.cpuUsage(),t0=performance.now();const created=await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:`Synthetic ${i}`,amountCents:10000+i}});const t1=performance.now();if(created.statusCode!==201)throw Error('create failed');const executed=await app.inject({method:'POST',url:`/api/invoices/${created.json().id}/simulate`});const t2=performance.now();if(executed.statusCode!==200)throw Error('simulate failed');const cpu=process.cpuUsage(cpu0);if(i>=20)samples.push({caseIndex:i-20,createMs:t1-t0,simulateMs:t2-t1,totalMs:t2-t0,cpuMs:(cpu.user+cpu.system)/1000});
 }
 const dest='benchmark/results/latency-diagnosis';mkdirSync(dest,{recursive:true});
 const rows=['case_index,create_ms,simulate_ms,total_ms,process_cpu_ms',...samples.map(x=>[x.caseIndex,x.createMs.toFixed(3),x.simulateMs.toFixed(3),x.totalMs.toFixed(3),x.cpuMs.toFixed(3)].join(','))];writeFileSync(join(dest,'samples.csv'),rows.join('\n')+'\n');
 const sorted=[...samples].sort((a,b)=>b.totalMs-a.totalMs);const pct=p=>[...samples].sort((a,b)=>a.totalMs-b.totalMs)[Math.ceil(samples.length*p)-1].totalMs;
 const result={measurement:'in-process serial SQLite, no network',samples:samples.length,warmup:20,p50Ms:pct(.5),p95Ms:pct(.95),p99Ms:pct(.99),slowest:sorted.slice(0,10),note:'Process CPU includes both workload driver and server; wall-minus-CPU can include disk waits, scheduling, garbage collection and other effects. Phase timings localize the delay but do not independently prove root cause.'};
 writeFileSync(join(dest,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await app.close();rmSync(dir,{recursive:true,force:true})}
