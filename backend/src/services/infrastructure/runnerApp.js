import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminServerOperationsRouter } from '../../routes/admin/adminServerOperationsRouter.js';
import { isInfrastructureContext } from './context.js';
import { runnerScopeHash, isRunnerPath } from './runnerProtocol.js';

const scopeKeys = ['environment', 'poolId', 'databaseIdentity', 'panelIdentity'];
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const digest = value => createHash('sha256').update(value).digest();
const internalAdmin = Object.freeze({ id: '00000000-0000-4000-8000-000000000001', status: 'active' });

export function createRunnerApp({ runtime, scope, secret }) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error('RUNNER_SECRET_REQUIRED');
  if (!isInfrastructureContext(runtime?.context) || scope?.environment !== 'development' ||
      !scopeKeys.every(key => typeof scope[key] === 'string' && scope[key] && runtime.context[key] === scope[key])) {
    throw new Error('RUNNER_SCOPE_MISMATCH');
  }
  const boundScope = Object.freeze(Object.fromEntries(scopeKeys.map(key => [key, scope[key]])));
  const hash = runnerScopeHash(boundScope), expectedSecret = digest(secret);
  const app = express();
  app.disable('x-powered-by'); app.disable('trust proxy');
  app.locals.serverOperationsExecutionMode = 'local';
  let stopping = false;
  app.locals.stopRunner = () => { stopping = true; };
  const reject = (res, status, code) => res.status(status).json({ error: code, code });

  app.use(function runnerBoundary(req, res, next) {
    res.set('x-novanet-runner-scope', hash);
    res.set('Cache-Control', 'no-store');
    if (!loopback.has(req.socket?.remoteAddress)) return reject(res, 403, 'RUNNER_LOOPBACK_REQUIRED');
    const authorization = req.get('authorization') || '';
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
    // Hash both inputs so comparison length never depends on the supplied secret.
    const authenticated = timingSafeEqual(digest(match?.[1] || ''), expectedSecret);
    if (!match || !authenticated) return reject(res, 401, 'RUNNER_AUTH_REQUIRED');
    if (req.get('x-novanet-runner-scope') !== hash) return reject(res, 403, 'RUNNER_SCOPE_MISMATCH');
    if (stopping) return reject(res, 503, 'RUNNER_STOPPING');
    if (!isRunnerPath(req.method, req.originalUrl)) return reject(res, 404, 'RUNNER_PATH_NOT_ALLOWED');
    req.admin = internalAdmin;
    return next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => stopping ? reject(res, 503, 'RUNNER_STOPPING') : next());
  app.get('/health', (req, res) => res.json({ ok: true, role: 'dev-infrastructure-runner', version: 1, scope: boundScope }));
  app.use('/operations', createAdminServerOperationsRouter({ resolveRuntime: () => runtime }));
  app.use((req, res) => reject(res, 404, 'RUNNER_PATH_NOT_ALLOWED'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 :
      ['encoding.unsupported', 'charset.unsupported'].includes(error.type) ? 415 : 503;
    return reject(res, status, status === 413 ? 'RUNNER_BODY_TOO_LARGE' : status === 400 ? 'INVALID_OPERATION_INPUT' :
      status === 415 ? 'RUNNER_CONTENT_TYPE_UNSUPPORTED' : 'SERVER_OPERATIONS_UNAVAILABLE');
  });
  return app;
}
