import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

// Apply the opt-out before Next.js starts on Windows, macOS and Linux.
const require=createRequire(import.meta.url);
const next=require.resolve('next/dist/bin/next');
const child=spawn(process.execPath,[next,...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Unable to start Next.js');process.exitCode=1});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)});
