import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {run,setTracingDisabled} from '@openai/agents';
import {ScriptedModel,functionCall,assistantMessage} from '@openai/agents/testing';
import {buildApp} from '../api/app.mjs';
import {createLedgerAgent} from '../api/openai-agent.mjs';

setTracingDisabled(true); // Never export SDK traces or invoke a remote model in this test.
test('SDK approval pauses, then independent ledger blocks and persists the attempt across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'actionledger-sdk-')); const path=join(dir,'ledger.sqlite');
 const auth=async req=>({'agent-operator':{roles:['operator']},reviewer:{roles:['reviewer']}}[req.headers.authorization]??null);
 let app=buildApp({databasePath:path,requireIdentity:true,authenticate:auth});
 try{
  const created=await app.inject({method:'POST',url:'/api/invoices',headers:{authorization:'agent-operator'},payload:{vendor:'Synthetic supplier',amountCents:250000}});assert.equal(created.statusCode,201);const id=created.json().id;
  const model=new ScriptedModel([[functionCall('simulate_invoice',{invoiceId:id},{callId:'call-1'})],[assistantMessage('Finished.')]]);
  const agent=createLedgerAgent({app,model});let result=await run(agent,'Simulate this synthetic invoice');
  assert.equal(result.interruptions.length,1);
  let recovery=await app.inject({url:'/api/recovery',headers:{authorization:'agent-operator'}});assert.equal(recovery.json().simulatedEffects,0);
  result.state.approve(result.interruptions[0]);result=await run(agent,result.state);
  const toolOutput=JSON.stringify(result.newItems);assert.match(toolOutput,/blocked/);model.assertComplete();
  recovery=await app.inject({url:'/api/recovery',headers:{authorization:'agent-operator'}});assert.equal(recovery.json().simulatedEffects,0);
  await app.close();app=buildApp({databasePath:path,requireIdentity:true,authenticate:auth});
  let ledger=await app.inject({url:'/api/invoices',headers:{authorization:'agent-operator'}});assert.ok(ledger.json().events.some(e=>e.invoiceId===id&&e.action.includes('blockiert')));
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${id}/decision`,headers:{authorization:'reviewer'},payload:{decision:'approve'}})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${id}/simulate`,headers:{authorization:'agent-operator'}})).statusCode,200);
  recovery=await app.inject({url:'/api/recovery',headers:{authorization:'agent-operator'}});assert.equal(recovery.json().simulatedEffects,1);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('SDK tool guardrail independently blocks a disallowed argument',async()=>{
 const {Agent,tool}=await import('@openai/agents');const {z}=await import('zod');let executed=0;
 const checked=tool({name:'check_action',description:'Local comparison fixture',parameters:z.object({amountCents:z.number()}),inputGuardrails:[{name:'amount-limit',run:async ({toolCall})=>({behavior:JSON.parse(toolCall.arguments).amountCents>50000?{type:'rejectContent',message:'approval required'}:{type:'allow'}})}],execute:async()=>{executed++;return 'simulated';}});
 const model=new ScriptedModel([[functionCall('check_action',{amountCents:250000},{callId:'guardrail-1'})],[assistantMessage('Finished.')]]);
 const result=await run(new Agent({name:'Guardrail baseline',model,tools:[checked]}),'Check this synthetic action');
 assert.equal(executed,0);assert.match(JSON.stringify(result.newItems),/approval required/);model.assertComplete();
});
