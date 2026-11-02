// Finite embedded PostgreSQL checks only. Never reads dotenv or opens a DB URI.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const folder=new URL('../src/__tests__/database/',import.meta.url);
const names=process.argv.includes('--core-only')?['productionRelease.pglite.mjs']:
 fs.readdirSync(folder).filter(n=>n.endsWith('.pglite.mjs')||n==='lightnodeInfrastructure.test.mjs').sort();
let failed=0;
for(const name of names){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL(name,folder))],{encoding:'utf8',timeout:90000,env:process.env,maxBuffer:4*1024*1024});
 if(result.status!==0){failed++;console.error(`FAIL ${name}\n${(result.stderr||result.stdout||result.error?.message||'unknown').slice(0,1800)}`);}
 else console.log(`PASS ${name}`);
}
console.log(JSON.stringify({embeddedSqlPrograms:names.length,failed,externalDatabaseConnections:0,multiSessionConcurrencyVerified:false}));
if(failed)process.exitCode=1;
