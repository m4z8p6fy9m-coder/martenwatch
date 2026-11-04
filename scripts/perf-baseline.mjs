import Fastify from 'fastify';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
// Deliberately minimal counterfactual: same two endpoints and durable SQLite
// effect, but no authorization, approvals, recovery, event audit or telemetry.
export function buildBaseline(path){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; CREATE TABLE invoices (id TEXT PRIMARY KEY,vendor TEXT NOT NULL,amount_cents INTEGER NOT NULL); CREATE TABLE effects (invoice_id TEXT PRIMARY KEY REFERENCES invoices(id));');
 const app=Fastify();app.addHook('onClose',async()=>db.close());
 app.post('/api/invoices',async(req,reply)=>{const id=randomUUID();db.prepare('INSERT INTO invoices VALUES (?,?,?)').run(id,req.body.vendor,req.body.amountCents);return reply.code(201).send({id})});
 app.post('/api/invoices/:id/simulate',async(req,reply)=>{if(!db.prepare('SELECT id FROM invoices WHERE id=?').get(req.params.id))return reply.code(404).send();db.prepare('INSERT OR IGNORE INTO effects VALUES (?)').run(req.params.id);return {ok:true}});
 return app;
}
