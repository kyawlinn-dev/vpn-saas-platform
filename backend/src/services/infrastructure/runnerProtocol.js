import {createHash} from 'node:crypto';
import {infrastructureError} from './repository.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function readRunnerScope(env) {
  let database, panel;
  try { database = new URL(env.SUPABASE_URL); panel = new URL(env.SERVER_ACCESS_PANEL_IDENTITY); }
  catch { throw infrastructureError('RUNNER_SCOPE_MISMATCH'); }
  if (env.SERVER_ACCESS_ENVIRONMENT !== 'development' || database.protocol !== 'https:' ||
      database.hostname !== 'huqmzvlzfcexycdrsxpn.supabase.co' || database.username || database.password ||
      env.SERVER_ACCESS_DATABASE_IDENTITY !== database.hostname || !uuid.test(env.SERVER_ACCESS_POOL_ID || '') ||
      panel.protocol !== 'https:' || panel.username || panel.password || panel.origin !== env.SERVER_ACCESS_PANEL_IDENTITY) {
    throw infrastructureError('RUNNER_SCOPE_MISMATCH');
  }
  return Object.freeze({environment:'development', poolId:env.SERVER_ACCESS_POOL_ID,
    databaseIdentity:env.SERVER_ACCESS_DATABASE_IDENTITY, panelIdentity:panel.origin});
}
export function runnerScopeHash(scope) {
  return createHash('sha256').update(JSON.stringify(['environment','poolId','databaseIdentity','panelIdentity'].map(key => scope[key]))).digest('hex');
}
export function isRunnerPath(method, path) {
  if (!['GET','POST'].includes(method) || typeof path !== 'string' || path.length > 2048 ||
      !path.startsWith('/') || path.startsWith('//') || /[%#\\\s]/.test(path)) return false;
  let url;
  try { url = new URL(path,'http://127.0.0.1'); } catch { return false; }
  if (url.pathname !== path.split('?')[0]) return false;
  const route = url.pathname.replace(/\/$/,'');
  if (method === 'GET' && route === '/operations/catalog') {
    const keys = [...url.searchParams.keys()];
    return keys.length === new Set(keys).size && keys.every(key => ['provider','region','refresh'].includes(key)) &&
      ['digitalocean','vultr','lightnode'].includes(url.searchParams.get('provider')) &&
      (!url.searchParams.has('region') || /^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get('region'))) &&
      (!url.searchParams.has('refresh') || ['true','false'].includes(url.searchParams.get('refresh')));
  }
  if (url.search || path.includes('?')) return false;
  if (method === 'GET' && ['/health','/operations'].includes(route)) return true;
  if (method === 'POST' && ['/operations','/operations/quotes'].includes(route)) return true;
  const parts = route.split('/');
  return parts[1] === 'operations' && uuid.test(parts[2] || '') &&
    (method === 'GET' && parts.length === 3 || method === 'POST' && parts.length === 4 && ['resume','cancel'].includes(parts[3]));
}
