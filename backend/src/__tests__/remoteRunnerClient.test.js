import express from 'express';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createAdminServerOperationsRouter} from '../routes/admin/adminServerOperationsRouter.js';
import {createRemoteRunnerClient} from '../services/infrastructure/remoteRunnerClient.js';
import {readRunnerScope,runnerScopeHash} from '../services/infrastructure/runnerProtocol.js';

const env={SERVER_ACCESS_ENVIRONMENT:'development', SERVER_ACCESS_POOL_ID:'bee21225-e51f-4294-892f-576007223ebc',
  SERVER_ACCESS_DATABASE_IDENTITY:'huqmzvlzfcexycdrsxpn.supabase.co',SERVER_ACCESS_PANEL_IDENTITY:'https://panel.novanetmm.com',
  SUPABASE_URL:'https://huqmzvlzfcexycdrsxpn.supabase.co', SERVER_RUNNER_CONFIG_PATH:'D:/private/runner.json'};
const scopeHash=runnerScopeHash(readRunnerScope(env));
const config={host:'178.128.127.163',username:'novanet-dev-link',privateKeyPath:'D:/private/runner.key',hostKeySha256:`SHA256:${'a'.repeat(43)}`,secret:'a'.repeat(64)};
const servers=[];
afterEach(async()=>{for(const s of servers.splice(0))await new Promise(resolve=>{s.closeAllConnections();s.close(resolve);});});
async function clientFixture() {
  const transport={request:vi.fn(async()=>({status:200,headers:{'x-novanet-runner-scope':scopeHash},data:{enabled:true,operations:[]}})),close:vi.fn()};
  const readFileImpl=vi.fn(async path=>path===env.SERVER_RUNNER_CONFIG_PATH?JSON.stringify(config):'private-fixture-key');
  const transportFactory=vi.fn(()=>transport);
  const client=await createRemoteRunnerClient({env,readFileImpl,transportFactory});
  return{transport,client,transportFactory};
}
describe('private remote runner boundary',()=>{
  it('injects private runner authentication/scope, preserves identical request identity, and makes only one attempt',async()=>{
    const f=await clientFixture();
    await f.client.request({method:'POST',path:'/operations',body:{quote_id:'quote'},idempotencyKey:'same-request'});
    expect(f.transport.request).toHaveBeenCalledWith(expect.objectContaining({method:'POST',path:'/operations',body:{quote_id:'quote'},headers:{authorization:`Bearer ${config.secret}`,'x-novanet-runner-scope':scopeHash,'idempotency-key':'same-request'}}));
    f.transport.request.mockRejectedValue(Error('raw secret error'));
    await expect(f.client.request({method:'POST',path:'/operations',body:{quote_id:'quote'},idempotencyKey:'same-request'})).rejects.toMatchObject({code:'RUNNER_REQUEST_UNCERTAIN'});
    expect(f.transport.request).toHaveBeenCalledTimes(2);
  });
  it('rejects wrong response scope and bounds/sanitizes remote errors',async()=>{
    const f=await clientFixture();
    f.transport.request.mockResolvedValue({status:200,headers:{'x-novanet-runner-scope':'wrong'},data:{enabled:true}});
    await expect(f.client.request({method:'GET',path:'/operations'})).rejects.toThrow('RUNNER_SCOPE_MISMATCH');
    f.transport.request.mockResolvedValue({status:503,headers:{'x-novanet-runner-scope':scopeHash},data:{code:'RUNNER_INTERNAL_SECRET',error:'private data'}});
    expect(await f.client.request({method:'GET',path:'/operations'})).toEqual({status:503,data:{code:'SERVER_OPERATIONS_UNAVAILABLE',error:'SERVER_OPERATIONS_UNAVAILABLE'}});
  });
  it.each([false,true])('keeps local active-admin authorization before forwarding (%s)',async authorized=>{
    const f=await clientFixture(),resolveRuntime=vi.fn(()=>{throw Error('Must not run local');});
    const app=express();app.use(express.json());
    if(authorized)app.use((req,res,next)=>{req.admin={id:'admin',status:'active'};next();});
    app.use('/api/admin/server-operations',createAdminServerOperationsRouter({resolveRuntime,resolveRemoteClient:()=>f.client}));
    const s=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});servers.push(s);
    const r=await fetch(`http://127.0.0.1:${s.address().port}/api/admin/server-operations`);
    expect(r.status).toBe(authorized?200:401);
    expect(f.transport.request).toHaveBeenCalledTimes(authorized?1:0);
    expect(resolveRuntime).not.toHaveBeenCalled();
  });
  it('fails closed on remote configuration failure without local runtime fallback',async()=>{
    const app=express(),resolveRuntime=vi.fn();
    app.use((req,res,next)=>{req.admin={id:'admin',status:'active'};req.app.locals.serverOperationsExecutionMode='remote';next();});
    app.use('/api/admin/server-operations',createAdminServerOperationsRouter({resolveRuntime}));
    const s=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});servers.push(s);
    const r=await fetch(`http://127.0.0.1:${s.address().port}/api/admin/server-operations`);
    expect(r.status).toBe(503);expect(resolveRuntime).not.toHaveBeenCalled();
  });
});
