import {randomUUID} from 'node:crypto';

// Experimental non-idempotent external provider workflow. A timeout, disconnect,
// or process death after dispatch is ambiguous and NEVER automatically retried.
export function createExternalReliabilityLab(db) {
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;
 CREATE TABLE IF NOT EXISTS external_lab_actions (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id), state TEXT NOT NULL CHECK(state IN ('ready','dispatching','unknown','completed')), attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS external_lab_events (id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES external_lab_actions(id), event TEXT NOT NULL, at TEXT NOT NULL);`);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}};
 const event=(id,name)=>db.prepare('INSERT INTO external_lab_events VALUES (?,?,?,?)').run(randomUUID(),id,name,new Date().toISOString());
 const get=id=>db.prepare('SELECT * FROM external_lab_actions WHERE id=?').get(id);
 function create(invoiceId){return tx(()=>{const invoice=db.prepare('SELECT status FROM invoices WHERE id=?').get(invoiceId);if(!invoice||!['processed','approved'].includes(invoice.status))return {error:'approval_required'};let action=db.prepare('SELECT * FROM external_lab_actions WHERE invoice_id=?').get(invoiceId);if(action)return action;const id=randomUUID();db.prepare("INSERT INTO external_lab_actions VALUES (?,?,'ready',0)").run(id,invoiceId);event(id,'created');return get(id)})}
 function claim(id){return tx(()=>{const action=get(id);if(!action||action.state!=='ready')return null;const invoice=db.prepare('SELECT status FROM invoices WHERE id=?').get(action.invoice_id);if(!invoice||!['processed','approved'].includes(invoice.status)){event(id,'authorization_denied');return null}db.prepare("UPDATE external_lab_actions SET state='dispatching',attempts=attempts+1 WHERE id=?").run(id);event(id,'dispatch_started');return get(id)})}
 function complete(id){return tx(()=>{if(get(id)?.state!=='dispatching')return false;db.prepare("UPDATE external_lab_actions SET state='completed' WHERE id=?").run(id);event(id,'provider_confirmed');return true})}
 function unknown(id){return tx(()=>{if(get(id)?.state!=='dispatching')return false;db.prepare("UPDATE external_lab_actions SET state='unknown' WHERE id=?").run(id);event(id,'outcome_unknown');return true})}
 // Only call after all prior workers are demonstrably dead, never during ordinary
 // app startup: without leases, concurrent recovery could race a live worker.
 function recoverAfterWorkersStopped(){return tx(()=>{const rows=db.prepare("SELECT id FROM external_lab_actions WHERE state='dispatching'").all();for(const row of rows){db.prepare("UPDATE external_lab_actions SET state='unknown' WHERE id=?").run(row.id);event(row.id,'recovered_unknown')}return rows.length})}
 // Laboratory operator assertion only: production requires authenticated review,
 // provider evidence and a trusted reconciliation process.
 function reconcile(id,outcome){return tx(()=>{if(get(id)?.state!=='unknown')return false;if(!['confirmed_executed','confirmed_not_executed'].includes(outcome))throw Error('Invalid reconciliation outcome');db.prepare('UPDATE external_lab_actions SET state=? WHERE id=?').run(outcome==='confirmed_executed'?'completed':'ready',id);event(id,`reconciled_${outcome}`);return true})}
 async function dispatch(id,provider){const action=claim(id);if(!action)return {status:'not_dispatched'};try{const response=await provider(action);if(response!==true)throw Error('Unconfirmed provider response');complete(id);return {status:'completed'}}catch{unknown(id);return {status:'unknown'}}}
 return {create,claim,complete,unknown,recoverAfterWorkersStopped,reconcile,dispatch,get,events:id=>db.prepare('SELECT event FROM external_lab_events WHERE action_id=? ORDER BY rowid').all(id).map(x=>x.event)};
}
