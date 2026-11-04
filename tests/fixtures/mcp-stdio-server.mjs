// Test fixture only: fake identities and a disposable database, never production.
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {buildApp} from '../../api/app.mjs';
import {createToolGateway} from '../../api/tool-gateway.mjs';
import {createLedgerMcpServer} from '../../api/mcp-server.mjs';

const app=buildApp({databasePath:process.argv[2],requireIdentity:true,authenticate:async req=>req.headers.authorization==='fixture-operator'?{roles:['operator']}:null});
const server=createLedgerMcpServer({callTool:createToolGateway({app,authorization:'fixture-operator'})});
await server.connect(new StdioServerTransport());
process.stdin.on('end',async()=>{await server.close();await app.close();});
