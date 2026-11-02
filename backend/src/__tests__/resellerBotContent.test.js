import http from 'node:http';
import {once} from 'node:events';
import express from 'express';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {createResellerBotContentRouter} from '../routes/reseller/resellerBotContentRouter.js';
import {createTelegramBotContentService} from '../services/telegramBotContentService.js';

const servers=[];afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise(r=>s.close(r))));});
async function fixture(){
  const service={list:vi.fn(async()=>[]),save:vi.fn(async(_r,key,text)=>({key,text})),reset:vi.fn(async(_r,key)=>({key})),
    preview:createTelegramBotContentService({client:{}}).preview};
  const syncCommands=vi.fn(async()=>({status:'synced'}));
  const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.headers['x-tenant'])req.reseller={id:req.headers['x-tenant']};next();});
  app.use('/content',createResellerBotContentRouter({getService:async()=>service,syncCommands}));
  const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');
  return {service,syncCommands,request:async(method,path='',body,tenant='one')=>{
    const headers={'content-type':'application/json',...(tenant?{'x-tenant':tenant}:{})};
    const r=await fetch(`http://127.0.0.1:${server.address().port}/content${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  }};
}
describe('reseller bot content routes',()=>{
  it('requires tenant context and never accepts tenant selection in a body',async()=>{
    const f=await fixture();expect((await f.request('GET','',undefined,null)).status).toBe(401);
    expect((await f.request('PATCH','/MENU_HOME',{text:'Hi',reseller_id:'two'})).status).toBe(400);
    expect(f.service.save).not.toHaveBeenCalled();
  });
  it('binds list/save/reset to the authenticated reseller',async()=>{
    const f=await fixture();expect((await f.request('GET')).body.items).toEqual([]);
    expect((await f.request('PATCH','/guides.shadowsocks.url',{text:'https://t.me/example/1'})).status).toBe(200);
    expect(f.service.save).toHaveBeenCalledWith('one','guides.shadowsocks.url','https://t.me/example/1');
    expect((await f.request('DELETE','/guides.shadowsocks.url',undefined,'two')).status).toBe(200);
    expect(f.service.reset).toHaveBeenCalledWith('two','guides.shadowsocks.url');
  });
  it('previews with the same validation without saving and reports unavailable storage safely',async()=>{
    const f=await fixture();expect((await f.request('POST','/MENU_HOME/preview',{text:'<script>x</script>'})).status).toBe(400);
    expect((await f.request('POST','/guides.vless.url/preview',{text:'https://t.me/example/2'})).body.text).toBe('https://t.me/example/2');
    expect(f.service.save).not.toHaveBeenCalled();
    f.service.list.mockRejectedValue(Object.assign(new Error('private SQL secret'),{code:'BOT_CONTENT_STORAGE_UNAVAILABLE'}));
    const r=await f.request('GET');expect(r.status).toBe(503);expect(JSON.stringify(r.body)).not.toContain('private');
  });
  it('rejects former command/message editing routes before persistence or command sync',async()=>{
    const f=await fixture();
    for(const key of ['commands.start.description','MENU_HOME','startWelcome']){
      expect((await f.request('PATCH','/'+key,{text:'Changed'})).status).toBe(400);
      expect((await f.request('DELETE','/'+key)).status).toBe(400);
      expect((await f.request('POST','/'+key+'/preview',{text:'Changed'})).status).toBe(400);
    }
    expect(f.service.save).not.toHaveBeenCalled();expect(f.service.reset).not.toHaveBeenCalled();expect(f.syncCommands).not.toHaveBeenCalled();
  });
});
