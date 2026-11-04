import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildApp} from '../api/app.mjs';
import {createToolGateway} from '../api/tool-gateway.mjs';
import {createLedgerMcpServer} from '../api/mcp-server.mjs';

const authenticate=async req=>({operator:{roles:['operator']},reviewer:{roles:['reviewer']}}[req.headers.authorization]??null);
test('real MCP client lists and calls gated simulated tool without bypassing approval',async()=>{
 const app=buildApp({requireIdentity:true,authenticate});
 const server=createLedgerMcpServer({callTool:createToolGateway({app,authorization:'operator'})});
 const client=new Client({name:'actionledger-test',version:'0.1.0'});
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['simulate_invoice']);
  const invoice=await app.inject({method:'POST',url:'/api/invoices',headers:{authorization:'operator'},payload:{vendor:'Synthetic',amountCents:250000}});const id=invoice.json().id;
  const bad=await client.callTool({name:'simulate_invoice',arguments:{invoiceId:'not-a-uuid'}});assert.equal(bad.isError,true);
  const blocked=await client.callTool({name:'simulate_invoice',arguments:{invoiceId:id}});assert.equal(blocked.isError,true);assert.equal(blocked.structuredContent.status,'blocked');
  assert.equal((await app.inject({url:'/api/recovery',headers:{authorization:'operator'}})).json().simulatedEffects,0);
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${id}/decision`,headers:{authorization:'reviewer'},payload:{decision:'approve'}})).statusCode,200);
  const approved=await client.callTool({name:'simulate_invoice',arguments:{invoiceId:id}});assert.equal(approved.structuredContent.status,'completed');assert.equal(approved.structuredContent.simulated,true);
  await client.callTool({name:'simulate_invoice',arguments:{invoiceId:id}});
  assert.equal((await app.inject({url:'/api/recovery',headers:{authorization:'operator'}})).json().simulatedEffects,1);
 }finally{await client.close();await server.close();await app.close();}
});

test('MCP gateway errors do not reveal exception details',async()=>{
 const server=createLedgerMcpServer({callTool:async()=>{throw Error('PRIVATE-ERROR-DETAIL')}});
 const client=new Client({name:'error-test',version:'0.1.0'});const [a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(b);await client.connect(a);const result=await client.callTool({name:'simulate_invoice',arguments:{invoiceId:'00000000-0000-4000-8000-000000000000'}});assert.equal(result.isError,true);assert.equal(result.structuredContent.reason,'tool_unavailable');assert.doesNotMatch(JSON.stringify(result),/PRIVATE-ERROR-DETAIL/);}finally{await client.close();await server.close()}
});

test('stdio MCP process enforces the durable approval decision across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledger-mcp-'));const path=join(dir,'ledger.sqlite');
 const app=buildApp({databasePath:path,requireIdentity:true,authenticate});let client;
 try{
  const created=await app.inject({method:'POST',url:'/api/invoices',headers:{authorization:'operator'},payload:{vendor:'Synthetic',amountCents:250000}});const id=created.json().id;
  const fixture=fileURLToPath(new URL('./fixtures/mcp-stdio-server.mjs',import.meta.url));
  const connect=async()=>{const c=new Client({name:'stdio-test',version:'0.1.0'});await c.connect(new StdioClientTransport({command:process.execPath,args:[fixture,path],stderr:'pipe'}));return c;};
  client=await connect();assert.equal((await client.callTool({name:'simulate_invoice',arguments:{invoiceId:id}})).structuredContent.status,'blocked');await client.close();client=null;
  assert.equal((await app.inject({method:'POST',url:`/api/invoices/${id}/decision`,headers:{authorization:'reviewer'},payload:{decision:'approve'}})).statusCode,200);
  client=await connect();assert.equal((await client.callTool({name:'simulate_invoice',arguments:{invoiceId:id}})).structuredContent.status,'completed');await client.close();client=null;
  assert.equal((await app.inject({url:'/api/recovery',headers:{authorization:'operator'}})).json().simulatedEffects,1);
 }finally{if(client)await client.close();await app.close();rmSync(dir,{recursive:true,force:true});}
});
