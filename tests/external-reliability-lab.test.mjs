import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {buildApp} from '../api/app.mjs';
import {createExternalReliabilityLab} from '../api/external-reliability-lab.mjs';
const worker=fileURLToPath(new URL('./fixtures/external-worker.mjs',import.meta.url));
async function fixture(amount=100){const dir=mkdtempSync(join(tmpdir(),'ledger-external-lab-'));const path=join(dir,'test.sqlite');const app=buildApp({databasePath:path});const invoice=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Synthetic test',amountCents:amount}})).json();await app.close();const f={dir,path,invoice,reopen(){this.db?.close();this.db=new DatabaseSync(path);this.lab=createExternalReliabilityLab(this.db)},close(){this.db.close();rmSync(dir,{recursive:true,force:true})}};f.reopen();return f}
async function startProvider(handler){const server=createServer(handler);await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));return {server,url:`http://127.0.0.1:${server.address().port}/simulate`}}
test('hard kill after simulated provider effect: repeated restart remains unknown and never repeats', {timeout:20000},async()=>{
 const f=await fixture();let child,provider;let effects=0,received;const requestReceived=new Promise(resolve=>received=resolve);
 try{const action=f.lab.create(f.invoice.id);provider=await startProvider((req,res)=>{req.resume();req.on('end',()=>{effects++;received();/* no response: provider did work before worker crash */})});
 child=spawn(process.execPath,[worker,f.path,action.id,provider.url],{stdio:['ignore','pipe','pipe']});
 await Promise.race([requestReceived,new Promise((_,reject)=>setTimeout(()=>reject(Error('worker did not reach simulated provider')),5000))]);
 const exited=once(child,'exit');child.kill('SIGKILL');await exited;child=null;
 assert.equal(f.lab.recoverAfterWorkersStopped(),1);assert.equal(f.lab.get(action.id).state,'unknown');
 for(let i=0;i<3;i++){f.reopen();assert.equal(f.lab.recoverAfterWorkersStopped(),0);assert.equal((await f.lab.dispatch(action.id,async()=>{effects++;return true})).status,'not_dispatched')}
 assert.equal(effects,1);assert.equal(f.lab.get(action.id).attempts,1);assert.deepEqual(f.lab.events(action.id),['created','dispatch_started','recovered_unknown']);
 assert.equal(f.lab.reconcile(action.id,'confirmed_executed'),true);assert.equal((await f.lab.dispatch(action.id,async()=>{effects++;return true})).status,'not_dispatched');assert.equal(effects,1);
 }finally{if(child)child.kill('SIGKILL');if(provider){provider.server.closeAllConnections();await new Promise(resolve=>provider.server.close(resolve))}f.close()}
});
test('provider disconnect after effect and provider timeout are unknown, never automatic retry',{timeout:15000},async()=>{
 for(const failure of ['disconnect','timeout']){const f=await fixture();let provider;let effects=0;
 try{const action=f.lab.create(f.invoice.id);provider=await startProvider((req,res)=>{req.resume();req.on('end',()=>{effects++;if(failure==='disconnect')req.socket.destroy();})});
 const result=await f.lab.dispatch(action.id,async()=>{const response=await fetch(provider.url,{method:'POST',body:'simulated',signal:AbortSignal.timeout(500)});return response.ok});
 assert.equal(result.status,'unknown');assert.equal(f.lab.get(action.id).state,'unknown');assert.equal((await f.lab.dispatch(action.id,async()=>{effects++;return true})).status,'not_dispatched');assert.equal(effects,1);
 assert.equal(f.lab.reconcile(action.id,'confirmed_executed'),true);assert.equal(f.lab.get(action.id).state,'completed');
 }finally{if(provider){provider.server.closeAllConnections();await new Promise(resolve=>provider.server.close(resolve))}f.close()}}
});
test('two real worker processes race for same action; only one dispatch claim succeeds',{timeout:20000},async()=>{
 const f=await fixture();try{const action=f.lab.create(f.invoice.id);const exec=promisify(execFile);const results=await Promise.all([0,1].map(()=>exec(process.execPath,[worker,f.path,action.id,'claim-only'],{timeout:10000})));
 assert.equal(results.filter(r=>r.stdout.includes('DISPATCHING')).length,1);assert.equal(results.filter(r=>r.stdout.includes('NOT_CLAIMED')).length,1);assert.equal(f.lab.get(action.id).attempts,1);assert.equal(f.lab.recoverAfterWorkersStopped(),1);assert.equal(f.lab.get(action.id).state,'unknown');
 }finally{f.close()}
});
test('unapproved invoice cannot reach provider; confirmed absence enables controlled retry',async()=>{
 const f=await fixture(250000);try{assert.equal(f.lab.create(f.invoice.id).error,'approval_required');assert.equal(f.db.prepare('SELECT count(*) n FROM external_lab_actions').get().n,0);
 f.db.prepare("UPDATE invoices SET status='approved' WHERE id=?").run(f.invoice.id);const action=f.lab.create(f.invoice.id);let calls=0;
 assert.equal((await f.lab.dispatch(action.id,async()=>{calls++;throw Error('network failed')})).status,'unknown');assert.equal(f.lab.reconcile(action.id,'confirmed_not_executed'),true);
 assert.equal((await f.lab.dispatch(action.id,async()=>{calls++;return true})).status,'completed');assert.equal(calls,2);assert.equal(f.lab.get(action.id).attempts,2);
 }finally{f.close()}
});

test('authorization is rechecked at dispatch even after an action was queued',async()=>{
 const f=await fixture();try{const action=f.lab.create(f.invoice.id);f.db.prepare("UPDATE invoices SET status='pending_approval' WHERE id=?").run(f.invoice.id);let calls=0;
 assert.equal((await f.lab.dispatch(action.id,async()=>{calls++;return true})).status,'not_dispatched');assert.equal(calls,0);assert.equal(f.lab.get(action.id).attempts,0);assert.ok(f.lab.events(action.id).includes('authorization_denied'));
 }finally{f.close()}
});
