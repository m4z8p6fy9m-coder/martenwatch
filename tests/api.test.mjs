import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApp} from '../api/app.mjs';

test('approval is enforced, audited, and retained after restart', async () => {
  const dir = mkdtempSync(join(tmpdir(),'actionledger-')); const path=join(dir,'test.sqlite');
  let app=buildApp({databasePath:path});
  try {
    let res=await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Demo GmbH',amountCents:50001}});
    assert.equal(res.statusCode,201); const invoice=res.json(); assert.equal(invoice.status,'pending_approval');
    res=await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/decision`,payload:{decision:'approve'}});
    assert.equal(res.json().status,'approved');
    res=await app.inject({method:'POST',url:`/api/invoices/${invoice.id}/decision`,payload:{decision:'approve'}}); assert.equal(res.statusCode,409);
    await app.close(); app=buildApp({databasePath:path});
    res=await app.inject({url:'/api/invoices'}); assert.equal(res.json().invoices[0].status,'approved'); assert.equal(res.json().events.length,2);
  } finally {await app.close(); rmSync(dir,{recursive:true,force:true});}
});
test('API validates input and handles missing records', async () => {
 const app=buildApp(); try {
  for(const payload of [{vendor:' ',amountCents:100},{vendor:'x',amountCents:-1},{vendor:'x',amountCents:1.2}]) assert.equal((await app.inject({method:'POST',url:'/api/invoices',payload})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/invoices/missing/decision',payload:{decision:'approve'}})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:'/api/invoices/missing/decision',payload:{decision:'wrong'}})).statusCode,400);
 } finally {await app.close()}
});
