import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildPostgresApp} from '../api/postgres.mjs';

test('PostgreSQL gates actions and resumes interrupted simulated work', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
 const connectionString=process.env.TEST_DATABASE_URL;let app=await buildPostgresApp({connectionString});let pool;
 try {
  const high=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Integration test',amountCents:250000}})).json();
  assert.equal(high.status,'pending_approval');assert.equal((await app.inject({method:'POST',url:`/api/invoices/${high.id}/simulate`})).statusCode,409);
  const low=(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor:'Recovery test',amountCents:100}})).json();await app.close();
  pool=new pg.Pool({connectionString});await pool.query("INSERT INTO jobs VALUES ($1,$2,'running',1,false,now())",[randomUUID(),low.id]);await pool.end();pool=null;
  app=await buildPostgresApp({connectionString});assert.ok((await app.inject({url:'/health'})).json().recoveredOnStartup>=1);
  const r=(await app.inject({url:'/api/recovery'})).json();const job=r.jobs.find(j=>j.invoiceId===low.id);assert.equal(job.state,'completed');assert.equal(job.recovered,true);
  await app.inject({method:'POST',url:`/api/invoices/${low.id}/simulate`});pool=new pg.Pool({connectionString});assert.equal(Number((await pool.query('SELECT count(*) FROM simulated_effects WHERE invoice_id=$1',[low.id])).rows[0].count),1);
 } finally {if(pool)await pool.end();await app.close();}
});

test('PostgreSQL targets the requested job and reports running work as pending',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const connectionString=process.env.TEST_DATABASE_URL;const app=await buildPostgresApp({connectionString});const pool=new pg.Pool({connectionString});
 try{
  const create=async vendor=>(await app.inject({method:'POST',url:'/api/invoices',payload:{vendor,amountCents:100}})).json();
  const first=await create('Queued fixture'),second=await create('Requested fixture'),third=await create('Running fixture');
  await pool.query("INSERT INTO jobs VALUES ($1,$2,'queued',0,false,now()),($3,$4,'running',1,false,now())",[randomUUID(),first.id,randomUUID(),third.id]);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${second.id}/simulate`})).statusCode,200);
  assert.equal((await pool.query('SELECT state FROM jobs WHERE invoice_id=$1',[first.id])).rows[0].state,'queued');
  assert.equal(Number((await pool.query('SELECT count(*) FROM simulated_effects WHERE invoice_id=$1',[second.id])).rows[0].count),1);
  const pending=await app.inject({method:'POST',url:`/api/invoices/${third.id}/simulate`});assert.equal(pending.statusCode,202);assert.equal(pending.json().status,'in_progress');
  assert.equal(Number((await pool.query('SELECT count(*) FROM simulated_effects WHERE invoice_id=$1',[third.id])).rows[0].count),0);
 }finally{await pool.end();await app.close();}
});

test('PostgreSQL API rejects excess requests before the handler',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const app=await buildPostgresApp({connectionString:process.env.TEST_DATABASE_URL,rateLimitMax:2});
 try{assert.equal((await app.inject({url:'/health'})).statusCode,200);assert.equal((await app.inject({url:'/health'})).statusCode,200);assert.equal((await app.inject({url:'/health'})).statusCode,429);}finally{await app.close();}
});
