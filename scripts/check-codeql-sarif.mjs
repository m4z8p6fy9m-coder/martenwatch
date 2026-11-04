import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const dir=process.env.SARIF_DIR;if(!dir)throw Error('SARIF_DIR is required');
const files=readdirSync(dir).filter(f=>f.endsWith('.sarif'));if(!files.length)throw Error('No SARIF output found');
let count=0;for(const file of files){const data=JSON.parse(readFileSync(join(dir,file),'utf8'));if(!Array.isArray(data.runs))throw Error('Invalid SARIF');for(const run of data.runs){if(!Array.isArray(run.results))throw Error('Missing SARIF results');for(const finding of run.results){count++;const location=finding.locations?.[0]?.physicalLocation;console.log(`${file}: ${finding.ruleId??'unknown-rule'} (${finding.level??'unspecified'}) ${location?.artifactLocation?.uri??'unknown-location'}:${location?.region?.startLine??'?'}`);}}}
console.log(`CodeQL findings: ${count}`);if(count)process.exitCode=1;
