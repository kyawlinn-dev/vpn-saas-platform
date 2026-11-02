// Local deterministic packaging only: no connection strings, network or DB client.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../supabase/releases/2026-11-core/',import.meta.url);
const migrations=new URL('../supabase/migrations/',import.meta.url);
const file=new URL('manifest.json',root);
const manifest=JSON.parse(await fs.readFile(file,'utf8'));
const hash=text=>createHash('sha256').update(text).digest('hex');
const literal=text=>"'"+text.replaceAll("'","''")+"'";
const names=new Set(),parts=[];
for(const entry of manifest.migrations){
 if(!/^\d{4}_[a-z_]+\.sql$/.test(entry.file)||names.has(entry.file))throw Error('INVALID_MIGRATION_MANIFEST');
 names.add(entry.file);
 const sql=await fs.readFile(new URL(entry.file,migrations),'utf8');
 if(/messenger|announcement/i.test(sql))throw Error('DEFERRED_SCHEMA_IN_PACKAGE');
 entry.sha256=hash(sql);
 parts.push(`-- File: ${entry.file}; SHA256: ${entry.sha256}\n`+
  sql.replace(/^\s*begin;\s*$/gim,'').replace(/^\s*commit;\s*$/gim,''));
}
let guard=`do $release_guard$ begin
 if to_regclass('public.purchase_operations') is not null or to_regclass('public.server_operations') is not null
   or to_regclass('public.customer_trial_claims') is not null or to_regclass('public.notification_deliveries') is not null
 then raise exception 'RELEASE_ALREADY_INSTALLED_OR_PARTIAL'; end if;
`;
for(const baseline of manifest.baselineFunctions||[]){
 if(!/^[a-z_]+$/.test(baseline.name)||!/^[a-f0-9]{32}$/.test(baseline.md5))throw Error('INVALID_BASELINE_FUNCTION');
 guard+=` if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=${literal(baseline.name)})<>1
 or (select md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname=${literal(baseline.name)})
 is distinct from ${literal(baseline.md5)} then raise exception 'RELEASE_BASELINE_DRIFT: ${baseline.name}'; end if;\n`;
}
guard+='end $release_guard$;\n';
const bundle='-- REVIEW ARTIFACT ONLY: production application requires owner approval.\n-- Atomic dependency order from manifest.json; do not sort filenames.\nbegin;\n'+guard+parts.join('\n')+'\ncommit;\n';
if((bundle.match(/^begin;$/gim)||[]).length!==1||(bundle.match(/^commit;$/gim)||[]).length!==1)throw Error('NON_ATOMIC_BUNDLE');
manifest.bundle={file:'apply-reviewed-package.sql',sha256:hash(bundle)};
await fs.writeFile(new URL(manifest.bundle.file,root),bundle);
await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({packageBuilt:true,migrations:parts.length,bundleSha256:manifest.bundle.sha256,productionWrites:0}));
