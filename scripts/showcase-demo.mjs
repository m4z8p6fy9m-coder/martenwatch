import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run,setTracingDisabled} from '@openai/agents';
import {ScriptedModel,functionCall,assistantMessage} from '@openai/agents/testing';
import {buildApp} from '../api/app.mjs';
import {createLedgerAgent} from '../api/openai-agent.mjs';
setTracingDisabled(true);
const dir=mkdtempSync(join(tmpdir(),'actionledger-showcase-'));const path=join(dir,'demo.sqlite');
const identities={'agent-operator':{roles:['operator']},reviewer:{roles:['reviewer']}};
const auth=async req=>identities[req.headers.authorization]??null;
let app=buildApp({databasePath:path,requireIdentity:true,authenticate:auth});
const call=(method,url,actor,payload)=>app.inject({method,url,headers:{authorization:actor},...(payload?{payload}:{})});
function show(step,data){console.log(JSON.stringify({step,...data}))}
async function agentAttempt(id,callId){const model=new ScriptedModel([[functionCall('simulate_invoice',{invoiceId:id},{callId})],[assistantMessage('The simulation request finished.')]]);const agent=createLedgerAgent({app,model});let result=await run(agent,'Simulate the invoice');if(result.interruptions.length!==1)throw Error('SDK approval did not pause');show('sdk_approval_pause',{paused:true});result.state.approve(result.interruptions[0]);result=await run(agent,result.state);model.assertComplete();return JSON.stringify(result.newItems)}
try{
 const created=await call('POST','/api/invoices','agent-operator',{vendor:'Synthetic Vendor',amountCents:250000});if(created.statusCode!==201)throw Error('creation failed');const invoice=created.json();show('policy',{amountEUR:2500,status:invoice.status});
 const blocked=await agentAttempt(invoice.id,'call-blocked');if(!blocked.includes('blocked'))throw Error('ledger did not block');show('ledger_gate',{result:'blocked',reason:'ledger approval required'});
 const decision=await call('POST',`/api/invoices/${invoice.id}/decision`,'reviewer',{decision:'approve'});if(decision.statusCode!==200)throw Error('review failed');show('review',{result:decision.json().status,reviewer:'test fixture'});
 const done=await agentAttempt(invoice.id,'call-approved');if(!done.includes('completed'))throw Error('simulation not complete');const s=(await call('GET','/api/recovery','agent-operator')).json();if(s.simulatedEffects!==1)throw Error('unexpected effect count');show('simulation',{effects:s.simulatedEffects,realPayments:0});
 await app.close();app=buildApp({databasePath:path,requireIdentity:true,authenticate:auth});const events=(await call('GET',`/api/workflows/${invoice.id}`,'agent-operator')).json().events;show('after_restart',{stages:events.map(e=>`${e.stage}:${e.outcome}`),note:'local SQLite events; OpenTelemetry spans remain in memory only'});
}finally{await app.close();rmSync(dir,{recursive:true,force:true})}
