import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTenantLab} from './fixtures/tenant-lab.mjs';

test('isolated tenant lab rejects cross-tenant reads, approvals, actions and spoofed headers',async()=>{
 const lab=createTenantLab();try{
  const created=await lab.request('token-alpha',{method:'POST',url:'/api/invoices',payload:{vendor:'Alpha Demo',amountCents:250000}});assert.equal(created.statusCode,201);const id=created.json().id;
  const list=await lab.request('token-beta',{method:'GET',url:'/api/invoices',headers:{'x-tenant-id':'alpha'}});assert.equal(list.statusCode,200);assert.equal(list.json().invoices.length,0);assert.equal(list.json().events.length,0);
  assert.equal((await lab.request('token-beta',{method:'POST',url:`/api/invoices/${id}/decision`,headers:{'x-tenant-id':'alpha'},payload:{decision:'approve',tenant:'alpha'}})).statusCode,404);
  assert.equal((await lab.request('token-beta',{method:'POST',url:`/api/invoices/${id}/simulate`})).statusCode,404);
  assert.equal((await lab.request('token-beta',{method:'POST',url:`/api/invoices/${id}/analyze`})).statusCode,404);
  const alpha=await lab.request('token-alpha',{method:'GET',url:'/api/invoices'});assert.equal(alpha.json().invoices[0].status,'pending_approval');
  assert.equal((await lab.request('unknown',{method:'GET',url:'/api/invoices'})).statusCode,401);
 } finally {await lab.close();}
});
