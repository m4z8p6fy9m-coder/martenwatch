import {DatabaseSync} from 'node:sqlite';
import {createRecoveryEngine} from '../../api/recovery.mjs';
const db = new DatabaseSync(process.argv[2]);
const job = createRecoveryEngine(db).claim();
if (!job) process.exit(2);
process.stdout.write('CLAIMED\n');
setInterval(()=>{},1000);
