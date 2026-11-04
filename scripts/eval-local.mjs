import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));const out=join(root,'data','evals','latest');mkdirSync(out,{recursive:true});
const suites=[{name:'test-suite',args:['--test','tests/api.test.mjs','tests/telemetry.test.mjs','tests/security-lab.test.mjs','tests/tenant-lab.test.mjs','tests/openai-agent.test.mjs','tests/tool-gateway.test.mjs','tests/mcp.test.mjs','tests/foundry.test.mjs','tests/recovery.test.mjs','tests/external-reliability-lab.test.mjs']},{name:'security-development',args:['scripts/security-benchmark.mjs','development']},{name:'security-holdout',args:['scripts/security-benchmark.mjs','holdout']}];
const results=[];
for(const suite of suites){const started=performance.now();const child=spawn(process.execPath,suite.args,{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,OPENAI_API_KEY:'',OPENAI_TRACING_DISABLED:'true'}});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);const outcome=await new Promise(resolve=>{child.once('error',err=>resolve({exitCode:null,signal:null,error:err.message}));child.once('close',(exitCode,signal)=>resolve({exitCode,signal}))});writeFileSync(join(out,`${suite.name}.stdout.txt`),stdout);writeFileSync(join(out,`${suite.name}.stderr.txt`),stderr);results.push({name:suite.name,...outcome,durationMs:Math.round(performance.now()-started)});}
const hashes=Object.fromEntries(['benchmark/development.jsonl','benchmark/holdout.jsonl'].map(path=>[path,createHash('sha256').update(readFileSync(join(root,path))).digest('hex')]));
const report={version:1,createdAtUtc:new Date().toISOString(),runtime:process.version,datasetSha256:hashes,suites:results,status:results.every(x=>x.exitCode===0)?'passed':'failed',scope:'Local synthetic evaluation; no model inference, provider upload, or external payment.'};writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
