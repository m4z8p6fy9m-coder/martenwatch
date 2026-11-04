import {performance} from 'node:perf_hooks';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApp} from '../api/app.mjs';
import {buildBaseline} from './perf-baseline.mjs';
const mode=process.argv[2], run=Number(process.argv[3]);
if(!['baseline','ledger'].includes(mode)||!Number.isInteger(run))throw Error('invalid arguments');
const dir=mkdtempSync(join(tmpdir(),'ledger-perf-'));const path=join(dir,'run.sqlite');
const app=mode==='ledger'?buildApp({databasePath:path}):buildBaseline(path);let peakRss=process.memoryUsage().rss;
const sample=()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss)};
async function workflow(i){let t=performance.now();let create=await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:`Synthetic supplier ${i}`,amountCents:10000+i}});let outcome='ok';let simulation;
 if(create.statusCode===201){simulation=await app.inject({method:'POST',url:`/api/invoices/${create.json().id}/simulate`});if(simulation.statusCode!==200)outcome='error'}else outcome='error';
 sample();return {latencyMs:performance.now()-t,outcome,createStatus:create.statusCode,simulateStatus:simulation?.statusCode??0};}
try{
 for(let i=0;i<20;i++)await workflow(i); // warmup, same process and database
 const cpuStart=process.cpuUsage(),start=performance.now(),samples=[];
 for(let i=0;i<120;i++)samples.push({run,mode,caseIndex:i,...await workflow(i+20)});
 const elapsedMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);sample();
 console.log(JSON.stringify({mode,run,samples,elapsedMs,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,peakRssBytes:peakRss}));
}finally{await app.close();rmSync(dir,{recursive:true,force:true})}
