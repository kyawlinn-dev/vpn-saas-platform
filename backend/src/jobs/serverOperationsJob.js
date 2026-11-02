import { randomUUID } from "node:crypto";
import { isInfrastructureContext } from "../services/infrastructure/context.js";
import { infrastructureError } from "../services/infrastructure/repository.js";
import { runOperationStep } from "../services/infrastructure/worker.js";
import { shouldStartLocalOperationsWorker } from '../services/infrastructure/serverOperationsStartup.js';

const scanStates = new WeakMap();
const PAGE_SIZE = 10, MAX_SCAN_PAGES = 5, MAX_CLAIMS = 10;

function validateRuntime(runtime) {
  if (!isInfrastructureContext(runtime?.context) || (runtime.executionReady !== true && runtime.recoveryReady !== true) ||
      typeof runtime.repository?.listRunnableOperations !== "function" || typeof runtime.repository.claimOperation !== "function") throw infrastructureError("INFRASTRUCTURE_EXECUTION_DISABLED");
}
export async function runServerOperationsOnce({ runtime, workerId }) {
  if (!shouldStartLocalOperationsWorker(process.env)) return { disabled: true };
  validateRuntime(runtime);
  // Keep the scan position across ticks without mutating the frozen runtime or
  // operation checkpoints. A restarted worker safely begins a new sweep.
  if (!scanStates.has(runtime)) scanStates.set(runtime, { cursor: null });
  const state = scanStates.get(runtime);
  const results = [];
  let claims = 0;
  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    const operations = await runtime.repository.listRunnableOperations({ context: runtime.context, limit: PAGE_SIZE, owner: workerId, cursor: state.cursor });
    if (!operations.length) { state.cursor = null; break; }
    for (const operation of operations) {
      state.cursor = { createdAt: operation.created_at, id: operation.id };
      try {
        if (runtime.canRunOperation && !await runtime.canRunOperation(operation)) {
          results.push({ operationId: operation.id, error_code: 'PROVIDER_UNAVAILABLE' }); continue;
        }
        claims++;
        const claimed = await runtime.repository.claimOperation({ context: runtime.context, operationId: operation.id, owner: workerId, ttlSeconds: 120 });
        const lease = { id: claimed.id, operationId: claimed.id, owner: claimed.lease_owner, fence: Number(claimed.fence) };
        const step = () => runOperationStep({ ...runtime, lease });
        results.push(await (runtime.withLease ? runtime.withLease(lease, step) : step()));
      } catch (error) {
        // No provider payloads, private checkpoints or credentials in job output.
        results.push({ operationId: operation.id, error_code: ["LEASE_BUSY", "STALE_FENCE", "LEASE_EXPIRED"].includes(error.code) ? error.code : "OPERATION_STEP_UNCERTAIN" });
      }
      if (claims >= MAX_CLAIMS) return { results };
    }
    if (operations.length < PAGE_SIZE) { state.cursor = null; break; }
  }
  return { results };
}
export function startServerOperationsJob({ runtime, intervalMs = 5000, onError = () => {} }) {
  if (!shouldStartLocalOperationsWorker(process.env)) return () => {};
  validateRuntime(runtime);
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw infrastructureError("INVALID_JOB_INTERVAL");
  let busy = false, stopped = false;
  const workerId = randomUUID();
  const timer = setInterval(async () => {
    if (busy || stopped) return;
    busy = true;
    try { await runServerOperationsOnce({ runtime, workerId }); }
    catch { onError({ code: "SERVER_OPERATIONS_JOB_UNAVAILABLE" }); }
    finally { busy = false; }
  }, intervalMs);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
