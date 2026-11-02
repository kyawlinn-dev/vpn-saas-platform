import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {infrastructureError} from './repository.js';
import {isRunnerPath,readRunnerScope,runnerScopeHash} from './runnerProtocol.js';

const safeCodes = new Set(['INVALID_OPERATION_INPUT','CONFIRMATION_REQUIRED','QUOTE_CURRENCY_MISMATCH',
  'DESTINATION_PROTOCOL_MISMATCH','IDEMPOTENCY_CONFLICT','QUOTE_CHANGED','QUOTE_EXPIRED','QUOTE_ALREADY_USED',
  'SERVER_MIGRATION_IN_PROGRESS','CONTROL_CONFLICT','RETIREMENT_FALLBACK_UNAVAILABLE','DESTINATION_NOT_READY',
  'DESTINATION_CAPACITY_INSUFFICIENT','DESTINATION_SCOPE_MISMATCH','SHARED_DESTINATION_UNVERIFIED',
  'DESTINATION_PROBE_RUNNER_REQUIRED','PROVIDER_UNAVAILABLE','PROVIDER_CONFIGURATION_REQUIRED','PROVIDER_SSH_KEY_UNAVAILABLE',
  'FIREWALL_POLICY_UNVERIFIED','PROVIDER_IMAGE_UNAVAILABLE','REGION_UNAVAILABLE','PLAN_UNAVAILABLE','PLAN_INCOMPATIBLE',
  'CATALOG_UNAVAILABLE','PROVIDER_CATALOG_UNAVAILABLE','POLICY_REJECTED','CATALOG_STALE','PROVIDER_RATE_LIMITED',
  'PROVIDER_ACCOUNT_NOT_REGISTERED','INFRASTRUCTURE_CONFIGURATION_REQUIRED','RESOURCE_SCOPE_MISMATCH',
  'PROVIDER_CATALOG_STALE','PROVIDER_PLAN_UNAVAILABLE','PROVIDER_PLAN_INCOMPATIBLE','PROVIDER_REGION_DISALLOWED',
  'PROVIDER_PLAN_DISALLOWED','PROVIDER_BUDGET_EXCEEDED','PROVIDER_READ_UNAVAILABLE','PROVIDER_PAGINATION_INCOMPLETE',
  'INVALID_PROVIDER_POLICY','INVALID_PROVIDER_REGION','INVALID_PROVIDER_PLAN','PROTECTED_RESOURCE','OPERATION_NOT_FOUND',
  'INFRASTRUCTURE_EXECUTION_DISABLED','SERVER_OPERATIONS_UNAVAILABLE','RUNNER_SCOPE_MISMATCH']);
const transportCodes=new Set(['RUNNER_CONNECTION_FAILED','RUNNER_HOST_KEY_MISMATCH','RUNNER_REQUEST_UNCERTAIN','RUNNER_RESPONSE_INVALID']);
const fail=code=>{throw infrastructureError(code);};
export async function createRemoteRunnerClient({env=process.env,readFileImpl=readFile,transportFactory}={}) {
  const scope=readRunnerScope(env),hash=runnerScopeHash(scope);
  if(!env.SERVER_RUNNER_CONFIG_PATH || !isAbsolute(env.SERVER_RUNNER_CONFIG_PATH))fail('RUNNER_CONFIGURATION_REQUIRED');
  let config,privateKey;
  try {
    config=JSON.parse(await readFileImpl(env.SERVER_RUNNER_CONFIG_PATH,'utf8'));
    if(!config || Array.isArray(config) || Object.keys(config).some(key=>!['host','port','username','privateKeyPath','hostKeySha256','runnerPort','secret'].includes(key)) ||
      !/^[a-f0-9]{64}$/i.test(config.secret||'') || !isAbsolute(config.privateKeyPath||''))fail('RUNNER_CONFIGURATION_REQUIRED');
    privateKey=await readFileImpl(config.privateKeyPath,'utf8');
  } catch {fail('RUNNER_CONFIGURATION_REQUIRED');}
  const factory=transportFactory || (await import('./runnerSshTransport.js')).createSshRunnerTransport;
  const transport=await factory({host:config.host,port:config.port||22,username:config.username,privateKey,
    hostKeySha256:config.hostKeySha256,runnerPort:config.runnerPort||4317});
  return Object.freeze({scope,close:()=>transport.close(),async request({method,path,body,idempotencyKey}) {
    if(!isRunnerPath(method,path) || body!==undefined && Buffer.byteLength(JSON.stringify(body))>65536 ||
      idempotencyKey!==undefined && (typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(idempotencyKey)))fail('INVALID_OPERATION_INPUT');
    const headers={authorization:`Bearer ${config.secret}`,'x-novanet-runner-scope':hash,
      ...(idempotencyKey?{'idempotency-key':idempotencyKey}:{})};
    let result;
    try {result=await transport.request({method,path,headers,body});}
    catch(error){fail(transportCodes.has(error.code)?error.code:'RUNNER_REQUEST_UNCERTAIN');}
    if(result.headers?.['x-novanet-runner-scope']!==hash)fail('RUNNER_SCOPE_MISMATCH');
    if(!Number.isInteger(result.status)||result.status<200||result.status>599||!result.data||typeof result.data!=='object'||Array.isArray(result.data))fail('RUNNER_RESPONSE_INVALID');
    if(result.status>=300) {
      const code=safeCodes.has(result.data.code)?result.data.code:'SERVER_OPERATIONS_UNAVAILABLE';
      return{status:result.status,data:{error:code,code}};
    }
    return{status:result.status,data:result.data};
  }});
}
