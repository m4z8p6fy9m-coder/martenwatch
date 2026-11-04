import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app.mjs';
import { foundryFromEnv } from './foundry-config.mjs';
import { buildPostgresApp } from './postgres.mjs';

const rawPort = process.env.ACTIONLEDGER_API_PORT ?? '4000';
if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Invalid ACTIONLEDGER_API_PORT');
const dataDir = resolve(process.env.ACTIONLEDGER_DATA_DIR ?? 'data');
mkdirSync(dataDir, {recursive:true});
const agentProvider = foundryFromEnv(process.env);
const app = process.env.DATABASE_URL ? await buildPostgresApp({connectionString:process.env.DATABASE_URL,logger:true,agentProvider}) : buildApp({databasePath:resolve(dataDir,'actionledger.sqlite'),logger:true,agentProvider});
app.listen({port:Number(rawPort),host:'127.0.0.1'}).catch(err => { app.log.error(err); process.exit(1); });
