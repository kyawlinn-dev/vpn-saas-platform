import { readFile } from "node:fs/promises";
import { pathToFileURL } from 'node:url';
import { inspectAccessAdoption } from "../src/services/serverAccessMigrationService.js";

// Default inspection remains offline; live credentials come only from the backend
// process environment. There is deliberately no --env or dotenv support.
export async function runAdoptionCli(args, { env = process.env, read = readFile, output = console.log, errorOutput = console.error,
  createService, createClient } = {}) {
 try {
  const allowed = new Set(['--manifest', '--live', '--apply', '--approved-hash']);
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.has(key) || Object.hasOwn(values, key)) throw new Error('ADOPTION_ARGUMENTS_INVALID');
    values[key] = ['--manifest', '--approved-hash'].includes(key) ? args[++i] : true;
    if (values[key] == null || String(values[key]).startsWith('--')) throw new Error('ADOPTION_ARGUMENTS_INVALID');
  }
  if (values['--apply'] && (!values['--live'] || !/^[a-f0-9]{64}$/.test(values['--approved-hash'] || ''))) throw new Error('ADOPTION_APPROVAL_REQUIRED');
  if (values['--approved-hash'] && !values['--apply']) throw new Error('ADOPTION_ARGUMENTS_INVALID');
  const index = args.indexOf("--manifest");
  if (index < 0 || !args[index + 1]) throw new Error("USAGE: node scripts/adopt-public-server-access.mjs --manifest PATH [--live [--apply --approved-hash HASH]]");
  const manifest = JSON.parse(await read(args[index + 1], "utf8"));
  if (values['--live']) {
    if (!env.SERVER_INFRASTRUCTURE_CONFIG_PATH || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('ADOPTION_CONFIGURATION_REQUIRED');
    const operatorConfig = JSON.parse(await read(env.SERVER_INFRASTRUCTURE_CONFIG_PATH, 'utf8'));
    const factory = createService || (await import('../src/services/infrastructure/existingNodeAdoption.js')).createExistingNodeAdoption;
    const clientFactory = createClient || (await import('@supabase/supabase-js')).createClient;
    const client = clientFactory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const service = await factory({ env, operatorConfig, client });
    output(JSON.stringify(values['--apply'] ? await service.apply(manifest, values['--approved-hash']) : await service.inspect(manifest), null, 2));
    return 0;
  }
  const { environment, databaseIdentity, poolId, panelIdentity, vlessServiceId } = manifest;
  const report = await inspectAccessAdoption({ context: { environment, databaseIdentity, poolId, panelIdentity, vlessServiceId }, manifest });
  output(JSON.stringify({ mode: "offline-inspect", manifestHash: report.manifestHash, ready: false,
    message: "Guarded runtime inventory adapters are required; no resources were contacted or adopted.",
    blockerCodes: [...new Set(report.blockers.map(b => b.code))] }, null, 2));
  return 2;
 } catch (error) {
  const code = /^(ADOPTION_[A-Z_]+|RESOURCE_SCOPE_MISMATCH)$/.test(error.code || error.message) ? (error.code || error.message) : 'ADOPTION_UNAVAILABLE';
  errorOutput(error.message.startsWith('USAGE:') ? error.message : `${code}: inspection/application did not complete; inspect current state before retrying.`);
  return 1;
 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runAdoptionCli(process.argv.slice(2));
