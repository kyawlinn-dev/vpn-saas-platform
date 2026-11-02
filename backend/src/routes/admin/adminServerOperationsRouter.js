import express from "express";
import { quoteOperation, createOperationCommand, toOperationResponse } from "../../services/infrastructure/operations.js";
import { isInfrastructureContext } from "../../services/infrastructure/context.js";

const clientCodes = new Set(["INVALID_OPERATION_INPUT", "CONFIRMATION_REQUIRED", "QUOTE_CURRENCY_MISMATCH", "DESTINATION_PROTOCOL_MISMATCH"]);
const conflictCodes = new Set(["IDEMPOTENCY_CONFLICT", "QUOTE_CHANGED", "QUOTE_EXPIRED", "QUOTE_ALREADY_USED", "SERVER_MIGRATION_IN_PROGRESS", "CONTROL_CONFLICT"]);
conflictCodes.add('RETIREMENT_FALLBACK_UNAVAILABLE');
for(const code of ['DESTINATION_NOT_READY','DESTINATION_CAPACITY_INSUFFICIENT','DESTINATION_SCOPE_MISMATCH','SHARED_DESTINATION_UNVERIFIED','DESTINATION_PROBE_RUNNER_REQUIRED']) conflictCodes.add(code);
const readinessCodes=new Set(['PROVIDER_UNAVAILABLE','PROVIDER_CONFIGURATION_REQUIRED','PROVIDER_SSH_KEY_UNAVAILABLE','FIREWALL_POLICY_UNVERIFIED',
  'PROVIDER_IMAGE_UNAVAILABLE','REGION_UNAVAILABLE','PLAN_UNAVAILABLE','PLAN_INCOMPATIBLE','CATALOG_UNAVAILABLE','PROVIDER_CATALOG_UNAVAILABLE',
  'POLICY_REJECTED','CATALOG_STALE','PROVIDER_RATE_LIMITED','PROVIDER_ACCOUNT_NOT_REGISTERED','INFRASTRUCTURE_CONFIGURATION_REQUIRED','RESOURCE_SCOPE_MISMATCH']);
for(const code of ['PROVIDER_CATALOG_STALE','PROVIDER_PLAN_UNAVAILABLE','PROVIDER_PLAN_INCOMPATIBLE','PROVIDER_REGION_DISALLOWED',
  'PROVIDER_PLAN_DISALLOWED','PROVIDER_BUDGET_EXCEEDED','PROVIDER_READ_UNAVAILABLE','PROVIDER_PAGINATION_INCOMPLETE','INVALID_PROVIDER_POLICY'])readinessCodes.add(code);
clientCodes.add('INVALID_PROVIDER_REGION');clientCodes.add('INVALID_PROVIDER_PLAN');
const ref = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const label = value => typeof value === "string" ? value.slice(0, 80) : "";
function catalogOptions(options) {
  return (Array.isArray(options) ? options : []).filter(p => ["digitalocean", "vultr", "lightnode"].includes(p.id)).map(p => ({ id: p.id,
    regions: (Array.isArray(p.regions) ? p.regions : []).filter(r => ref(r.id)).slice(0, 100).map(r => ({ id: r.id, label: label(r.label),
      plans: (Array.isArray(r.plans) ? r.plans : []).filter(plan => ref(plan.id)).slice(0, 100).map(plan => ({ id: plan.id, label: label(plan.label) })) })) }));
}
export function createAdminServerOperationsRouter({ resolveRuntime = req => req.app.locals.serverOperationsRuntime,
  resolveRemoteClient = req => req.app.locals.serverOperationsRemoteClient } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!req.admin?.id || req.admin.status !== "active") return res.status(req.user ? 403 : 401).json({ error: "Admin access required" });
    return next();
  });
  router.use(async (req,res,next)=>{
    const remote=resolveRemoteClient(req);
    if(!remote && req.app.locals.serverOperationsExecutionMode!=='remote')return next();
    if(!remote)return res.status(503).json({error:'RUNNER_UNAVAILABLE',code:'RUNNER_UNAVAILABLE'});
    try {
      const result=await remote.request({method:req.method,path:`/operations${req.url==='/'?'':req.url}`,
        ...(req.method==='POST'?{body:req.body}:{}),idempotencyKey:req.get('Idempotency-Key')});
      return res.status(result.status).json(result.data);
    }catch(error){
      const safe=new Set(['RUNNER_CONNECTION_FAILED','RUNNER_HOST_KEY_MISMATCH','RUNNER_REQUEST_UNCERTAIN','RUNNER_RESPONSE_INVALID','RUNNER_SCOPE_MISMATCH','INVALID_OPERATION_INPUT']);
      const code=safe.has(error.code)?error.code:'RUNNER_UNAVAILABLE';
      return res.status(code==='INVALID_OPERATION_INPUT'?400:503).json({error:code,code});
    }
  });
  const wrap = handler => async (req, res) => {
    try { return await handler(req, res, await resolveRuntime(req)); }
    catch (error) {
      const code = clientCodes.has(error.code) || conflictCodes.has(error.code) || readinessCodes.has(error.code) || ["PROTECTED_RESOURCE", "RESOURCE_SCOPE_MISMATCH", "OPERATION_NOT_FOUND", "INFRASTRUCTURE_EXECUTION_DISABLED"].includes(error.code) ? error.code : "SERVER_OPERATIONS_UNAVAILABLE";
      const status = clientCodes.has(code) ? 400 : conflictCodes.has(code) ? 409 : ["PROTECTED_RESOURCE", "RESOURCE_SCOPE_MISMATCH"].includes(code) ? 403 : code === "OPERATION_NOT_FOUND" ? 404 : 503;
      return res.status(status).json({ error: code, code });
    }
  };
  router.get("/", wrap(async (req, res, runtime) => {
    const configured = isInfrastructureContext(runtime?.context);
    const rows = configured ? await runtime.repository.listOperations({ context: runtime.context, limit: 50 }) : [];
    return res.json({ enabled: configured && runtime.executionReady === true,
      recovery_enabled: configured && (runtime.recoveryReady === true || runtime.executionReady === true),
      reason: configured && runtime.executionReady ? null : configured?'PROVIDERS_UNAVAILABLE':req.app?.locals?.serverOperationsStartupError || "INFRASTRUCTURE_EXECUTION_DISABLED",
      provider_readiness: runtime?.providerReadiness?.map(row=>({id:row.id,ready:row.ready===true,reason:row.reason||null,profiles:row.profiles||[]})) || [],
      public_access_enabled: process.env.PUBLIC_SERVER_ACCESS_ENABLED === "true",
      options: configured ? catalogOptions(runtime.options) : [], operations: rows.map(toOperationResponse) });
  }));
  router.get('/catalog',wrap(async(req,res,runtime)=>{
    const {provider,region,refresh}=req.query;
    if(Object.keys(req.query).some(key=>!['provider','region','refresh'].includes(key)) || !['digitalocean','vultr','lightnode'].includes(provider) ||
      (region!==undefined&&!ref(region)) || (refresh!==undefined&&!['true','false'].includes(refresh)))throw Object.assign(new Error(),{code:'INVALID_OPERATION_INPUT'});
    if(!isInfrastructureContext(runtime?.context)||typeof runtime.getCatalog!=='function')throw Object.assign(new Error(),{code:'INFRASTRUCTURE_EXECUTION_DISABLED'});
    return res.json(await runtime.getCatalog({provider,region,refresh:refresh==='true'}));
  }));
  router.post("/quotes", wrap(async (req, res, runtime) => res.json({ quote: await quoteOperation(runtime, req.body) })));
  router.post("/", wrap(async (req, res, runtime) => res.status(202).json({ operation: await createOperationCommand(runtime, req.body, req.get("Idempotency-Key")) })));
  router.get("/:operationId", wrap(async (req, res, runtime) => {
    if (!isInfrastructureContext(runtime?.context)) throw Object.assign(new Error(), { code: "INFRASTRUCTURE_EXECUTION_DISABLED" });
    const operation = await runtime.repository.readOperation({ context: runtime.context, operationId: req.params.operationId });
    return res.json({ operation: toOperationResponse(operation) });
  }));
  for (const action of ["resume", "cancel"]) router.post(`/:operationId/${action}`, wrap(async (req, res, runtime) => {
    if (!isInfrastructureContext(runtime?.context) || !(runtime.executionReady || runtime.recoveryReady)) throw Object.assign(new Error(), { code: "INFRASTRUCTURE_EXECUTION_DISABLED" });
    const row = await runtime.repository.requestControl({ context: runtime.context, operationId: req.params.operationId, action });
    return res.json({ operation: toOperationResponse(row) });
  }));
  return router;
}
export default createAdminServerOperationsRouter();
