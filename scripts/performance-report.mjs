import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {cpus,totalmem,platform,arch,release,tmpdir} from 'node:os';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildApp} from '../api/app.mjs';
import {createRecoveryEngine} from '../api/recovery.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const dest=join(root,'benchmark','results','local-sanitized');mkdirSync(dest,{recursive:true});
const worker=fileURLToPath(new URL('./perf-worker.mjs',import.meta.url));const interrupt=fileURLToPath(new URL('../tests/fixtures/interrupted-worker.mjs',import.meta.url));const exec=promisify(execFile);
const runs=[],recoveries=[];const samples=[];
for(let run=1;run<=3;run++){
 const order=run%2?['baseline','ledger']:['ledger','baseline'];
 for(const mode of order){const {stdout}=await exec(process.execPath,[worker,mode,String(run)],{cwd:root,timeout:180000,maxBuffer:8*1024*1024});const result=JSON.parse(stdout);samples.push(...result.samples);delete result.samples;runs.push(result);}
}
for(let i=1;i<=5;i++){
 const dir=mkdtempSync(join(tmpdir(),'ledger-rec-bench-'));const path=join(dir,'state.sqlite');let app=buildApp({databasePath:path}),child;
 try {const invoice=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Synthetic',amountCents:100}})).json();await app.close();app=null;const db=new DatabaseSync(path);createRecoveryEngine(db).enqueue(invoice.id);db.close();
 child=spawn(process.execPath,[interrupt,path],{stdio:['ignore','pipe','pipe']});const [chunk]=await once(child.stdout,'data');if(!String(chunk).includes('CLAIMED'))throw Error('worker did not claim');
 const start=performance.now(),exited=once(child,'exit');child.kill('SIGKILL');await exited;child=null;app=buildApp({databasePath:path});const recoveryMs=performance.now()-start;const recovery=(await app.inject({url:'/api/recovery'})).json();recoveries.push({trial:i,recoveryMs,effects:recovery.simulatedEffects,completed:recovery.jobs.filter(j=>j.state==='completed').length});
 }finally{if(child)child.kill('SIGKILL');if(app)await app.close();rmSync(dir,{recursive:true,force:true})}
}
const sourceFiles=['api/app.mjs','api/recovery.mjs','api/policy.mjs','api/telemetry.mjs','scripts/perf-baseline.mjs','scripts/perf-worker.mjs','scripts/performance-report.mjs','tests/fixtures/interrupted-worker.mjs','package-lock.json'];
const sourceSha256=Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync(join(root,p))).digest('hex')]));
let gitCommit=null,gitDirty=null;try{const g=await exec('git',['rev-parse','--verify','HEAD'],{cwd:root,timeout:3000});if(/^[a-f0-9]{40,64}\s*$/.test(g.stdout)){gitCommit=g.stdout.trim();const s=await exec('git',['status','--porcelain'],{cwd:root,timeout:3000});gitDirty=Boolean(s.stdout.trim())}}catch{}
const quantile=(arr,p)=>{const a=[...arr].sort((x,y)=>x-y);return a[Math.ceil(a.length*p)-1]};const round=x=>Number(x.toFixed(3));
const summary={};for(const mode of ['baseline','ledger']){const rows=samples.filter(s=>s.mode===mode),rs=runs.filter(r=>r.mode===mode),lat=rows.map(r=>r.latencyMs);summary[mode]={samples:rows.length,p50Ms:round(quantile(lat,.5)),p95Ms:round(quantile(lat,.95)),p99Ms:round(quantile(lat,.99)),throughputWorkflowsPerSecond:round(rows.length/(rs.reduce((s,r)=>s+r.elapsedMs,0)/1000)),errors:rows.filter(x=>x.outcome!=='ok').length,errorRatePercent:round(100*rows.filter(x=>x.outcome!=='ok').length/rows.length),cpuSeconds:round(rs.reduce((s,r)=>s+r.cpuUserMs+r.cpuSystemMs,0)/1000),cpuTimePerWorkflowMs:round(rs.reduce((s,r)=>s+r.cpuUserMs+r.cpuSystemMs,0)/rows.length),peakRssMiB:round(Math.max(...rs.map(r=>r.peakRssBytes))/1048576)}}
const result={schemaVersion:1,generatedAtUtc:new Date().toISOString(),gitCommit,gitDirty,sourceSha256,environment:{node:process.version,os:platform(),osRelease:release(),architecture:arch(),cpuModel:cpus()[0]?.model??null,logicalCpus:cpus().length,totalMemoryGiB:round(totalmem()/1073741824)},method:{runCountPerMode:3,warmupWorkflows:20,measuredWorkflowsPerRun:120,concurrency:1,workload:'Create and simulate a valid below-threshold synthetic invoice over two in-process Fastify injections, persisted in local SQLite.',quantile:'nearest rank',ordering:'alternating baseline-first and ledger-first',rss:'sampled in worker process including Node runtime and workload driver, includes warmup',cpu:'process CPU time delta across measured workload, including workload driver',baseline:'minimal Fastify/SQLite; no authorization, approval, audit, recovery, or OTel',recovery:'kill signal to completed local in-process startup, includes process exit; baseline does not implement recovery'},summary,runs,recoveries};
const csv=['run,mode,case_index,latency_ms,outcome,create_status,simulate_status',...samples.map(x=>[x.run,x.mode,x.caseIndex,x.latencyMs.toFixed(6),x.outcome,x.createStatus,x.simulateStatus].join(','))].join('\n')+'\n';
writeFileSync(join(dest,'workflows.csv'),csv);writeFileSync(join(dest,'results.json'),JSON.stringify(result,null,2)+'\n');
const rtimes=recoveries.map(x=>x.recoveryMs);const md=`# Local performance experiment\n\nGenerated UTC: ${result.generatedAtUtc}. Git commit: ${gitCommit??'unavailable: this directory is not a Git checkout'}. Source hashes and environment are in results.json. This is a local experiment, not a production capacity claim.\n\n| Metric | Minimal baseline | ActionLedger |\n|---|---:|---:|\n${[['p50Ms','p50 (ms)'],['p95Ms','p95 (ms)'],['p99Ms','p99 (ms)'],['throughputWorkflowsPerSecond','Throughput (workflows/s)'],['cpuTimePerWorkflowMs','Process CPU time/workflow (ms)'],['peakRssMiB','Sampled peak RSS (MiB)'],['errorRatePercent','Error rate (%)']].map(([key,name])=>`| ${name} | ${summary.baseline[key]} | ${summary.ledger[key]} |`).join('\n')}\n\nLocal crash recovery (5 trials): p50 ${round(quantile(rtimes,.5))} ms; p95 ${round(quantile(rtimes,.95))} ms; p99 ${round(quantile(rtimes,.99))} ms. Five samples are insufficient for reliable tail latency. Raw trials and success checks are in results.json. The baseline has no recovery implementation and is not compared for recovery.\n\nSee [method and limitations](../../PERFORMANCE.md) and [raw per-workflow data](workflows.csv).\n`;
writeFileSync(join(dest,'REPORT.md'),md);console.log(JSON.stringify({summary,recoveries,gitCommit,destination:'benchmark/results/local-sanitized'},null,2));
if(samples.some(s=>s.outcome!=='ok')||recoveries.some(r=>r.effects!==1||r.completed!==1))process.exitCode=1;
