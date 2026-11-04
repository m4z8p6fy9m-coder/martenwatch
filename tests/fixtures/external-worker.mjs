import {DatabaseSync} from 'node:sqlite';
import {createExternalReliabilityLab} from '../../api/external-reliability-lab.mjs';
const db=new DatabaseSync(process.argv[2]);const lab=createExternalReliabilityLab(db);
const action=lab.claim(process.argv[3]);if(!action){process.stdout.write('NOT_CLAIMED\n');db.close();process.exit(0)}
process.stdout.write('DISPATCHING\n');
if(process.argv[4]==='claim-only'){db.close();process.exit(0)}
// The parent controls a local simulated provider and kills this worker after it
// observes the request. No payment endpoint is contacted.
try{await fetch(process.argv[4],{method:'POST',body:action.id});process.stdout.write('RESPONSE\n');}catch{}
setInterval(()=>{},1000);
