import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../api/app.mjs';
import {createToolGateway} from '../api/tool-gateway.mjs';

const authenticate=async req=>({operator:{roles:['operator']},reviewer:{roles:['reviewer']},agent:{roles:['agent']}}[req.headers.authorization]??null);
test('tool boundary rejects unknown tools, spoofed identity and malformed arguments before calling backend',async()=>{
 let calls=0;const gateway=createToolGateway({app:{inject:async()=>{calls++;throw new Error('unexpected')}},authorization:'agent'});
 assert.deepEqual(await gateway('approve_invoice',{invoiceId:'x'}),{status:'denied',reason:'unknown_tool'});
 for(const args of [null,[],{invoiceId:'../../decision'},{invoiceId:'00000000-0000-0000-0000-000000000000',authorization:'reviewer'}]) assert.equal((await gateway('simulate_invoice',args)).reason,'invalid_arguments');
 assert.equal(calls,0);
});
test('tool call remains subject to identity and independent approval in the ledger',async()=>{
 const app=buildApp({requireIdentity:true,authenticate});
 try {
  const created=await app.inject({method:'POST',url:'/api/invoices',headers:{authorization:'operator'},payload:{vendor:'Synthetic',amountCents:250000}});const id=created.json().id;
  const agent=createToolGateway({app,authorization:'agent'});const operator=createToolGateway({app,authorization:'operator'});
  assert.equal((await agent('simulate_invoice',{invoiceId:id})).status,'denied');
  assert.equal((await operator('simulate_invoice',{invoiceId:id})).status,'blocked');
  assert.equal((await app.inject({url:'/api/recovery',headers:{authorization:'operator'}})).json().simulatedEffects,0);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${id}/decision`,headers:{authorization:'reviewer'},payload:{decision:'approve'}})).statusCode,200);
  assert.deepEqual(await operator('simulate_invoice',{invoiceId:id}),{status:'completed',httpStatus:200,simulated:true});
  assert.equal((await app.inject({url:'/api/recovery',headers:{authorization:'operator'}})).json().simulatedEffects,1);
 }finally{await app.close()}
});

test('an unfinished action is reported as pending, never completed',async()=>{
 const call=createToolGateway({app:{inject:async()=>({statusCode:202})},authorization:'fixture'});
 assert.deepEqual(await call('simulate_invoice',{invoiceId:'00000000-0000-4000-8000-000000000000'}),{status:'pending',httpStatus:202,simulated:true});
});
