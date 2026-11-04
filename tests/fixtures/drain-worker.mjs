import {DatabaseSync} from 'node:sqlite';
import {createRecoveryEngine} from '../../api/recovery.mjs';
const db=new DatabaseSync(process.argv[2]);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');const engine=createRecoveryEngine(db);
let job,count=0;while((job=engine.claim())){engine.finish(job.id);count++;await new Promise(resolve=>setTimeout(resolve,2));}
process.stdout.write(JSON.stringify({completed:count}));db.close();
