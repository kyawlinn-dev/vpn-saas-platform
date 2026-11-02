import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const items=[
  ['guides.shadowsocks.url','Shadowsocks','User Guides','https://t.me/novanetmm/201'],
  ['guides.vless.url','VLESS','User Guides','https://t.me/novanetmm/202'],
].map(([key,label,group,text])=>({key,label,group,kind:'url',default_text:'',text,is_custom:!!text,placeholders:[],max_length:2048,updated_at:null}));
const bundle=await build({
  absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},
  stdin:{resolveDir:root,loader:'tsx',contents:`
    import {createRoot} from 'react-dom/client';
    import {BrowserRouter,Routes,Route,Navigate,useNavigate} from 'react-router';
    import {BotContentPage} from './src/pages/BotContentPage';
    import {useBotContent} from './src/hooks/useBotContent';
    window.fixture={items:${JSON.stringify(items)},calls:[],...window.fixtureOverrides};
    function Harness(){const hook=useBotContent();window.hook=hook;return <pre>{JSON.stringify(hook.items)}</pre>;}
    function Fixture(){window.fixtureNavigate=useNavigate();return <Routes>
      <Route path="/app/bot-links" element={<BotContentPage/>}/>
      <Route path="/app/bot-content" element={<Navigate to="/app/bot-links" replace/>}/>
      <Route path="/hook" element={<Harness/>}/>
      <Route path="/app/notifications" element={<h1>Notification editor</h1>}/>
    </Routes>;}
    createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);
  `},
  plugins:[{name:'fixture-only',setup(b){
    b.onResolve({filter:/providers\/ResellerAuthProvider$/},()=>({path:'auth',namespace:'fixture'}));
    b.onResolve({filter:/lib\/api$/},()=>({path:'api',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:root,contents:path==='auth'
      ? `import {useSyncExternalStore} from 'react';
         let auth={isAuthenticated:true,initializing:false,sessionId:'tenant-a'};const listeners=new Set();
         window.setFixtureAuth=next=>{auth={...auth,...next};listeners.forEach(l=>l());};
         export const useResellerAuth=()=>useSyncExternalStore(l=>{listeners.add(l);return()=>listeners.delete(l);},()=>auth);`
      : `const respond=(method,data)=>window.fixture.defer===method?new Promise(resolve=>{(window.fixture.pending||=[]).push(()=>resolve(data));}):data;
         const request=async(method,url,body)=>{
           const f=window.fixture;f.calls.push({method,url,body});
           if(f.fail||(f.loadFail&&method==='get'))throw {response:{data:{error:'Fixture rejected link'}}};
           if(method==='get')return respond(method,{data:{items:f.items}});
           const key=decodeURIComponent(url.split('/')[3]),item=f.items.find(i=>i.key===key);
           const saved={...item,text:method==='delete'?'':body.text,is_custom:method!=='delete'&&!!body.text};
           f.items=f.items.map(i=>i.key===key?saved:i);return respond(method,{data:{item:saved}});
         };export const api={get:u=>request('get',u),patch:(u,b)=>request('patch',u,b),delete:u=>request('delete',u)};`
    }));
  }}],
});
const assets=await readdir(path.join(root,'dist/assets')).catch(()=>[]);
const cssName=assets.find(n=>n.endsWith('.css'));
const css=cssName?await readFile(path.join(root,'dist/assets',cssName),'utf8'):'';
const output=await mkdtemp(path.join(tmpdir(),'novanet-bot-links-'));
const launch=()=>chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function open(browser,route='/app/bot-links',overrides={}){
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(5000);
  // No requests can reach owner services; this fixture has no server.
  await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;padding:12px"><div id="root"></div></body></html>'}):r.abort());
  await page.goto(`https://bot-links.invalid${route}`);await page.addStyleTag({content:css});
  await page.evaluate(v=>window.fixtureOverrides=v,overrides);await page.addScriptTag({content:bundle.outputFiles[0].text});return page;
}

test('Bot Links shows two guide URLs, saves and clears, validates and fits mobile',async()=>{
  const browser=await launch();
  try{
    const page=await open(browser,'/app/bot-content'),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('heading',{name:'Bot Links',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/app/bot-links');
    for(const name of ['User Guides'])await page.getByRole('heading',{name,exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox').count(),2);
    assert.equal(await page.locator('textarea,select').count(),0);
    assert.equal(await page.getByRole('button',{name:/Preview|Insert|Command|label/i}).count(),0);
    assert.equal(await page.getByRole('heading',{name:'Downloads',exact:true}).count(),0);
    const row=page.getByRole('region',{name:'Shadowsocks',exact:true}),input=row.getByRole('textbox',{name:'Shadowsocks URL',exact:true});
    for(const value of ['javascript:alert(1)','http://t.me/example/1','https://user:pass@t.me/example','https://t.me/a b','https://t.me/{name}','https://localhost/x','https://127.0.0.1/x','https://t.me/\u007f','https://t.me/'+'x'.repeat(2048)]){
      await input.fill(value);assert.equal(await row.getByRole('button',{name:'Save',exact:true}).isDisabled(),true,value);
      assert.equal(await row.getByRole('link',{name:'Open Shadowsocks link'}).count(),0,value);
    }
    await input.fill('https://t.me/novanetmm/301');
    assert.equal(await row.getByRole('link',{name:'Open Shadowsocks link'}).getAttribute('target'),'_blank');
    await row.getByRole('button',{name:'Save',exact:true}).click();await row.getByText('Saved',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.fixture.calls.find(c=>c.method==='patch')),{method:'patch',url:'/reseller/bot-content/guides.shadowsocks.url',body:{text:'https://t.me/novanetmm/301'}});
    assert.equal(await page.getByRole('textbox',{name:'VLESS URL',exact:true}).inputValue(),'https://t.me/novanetmm/202');
    for(const action of ['Clear','Save']){
      if(action==='Save')await input.fill('https://t.me/novanetmm/302');
      await page.evaluate(()=>window.fixture.fail=true);await row.getByRole('button',{name:action,exact:true}).click();
      await row.getByRole('alert').filter({hasText:'Fixture rejected link'}).waitFor();
      assert.equal(await input.inputValue(),`https://t.me/novanetmm/${action==='Clear'?'301':'302'}`);
      await page.evaluate(()=>window.fixture.fail=false);await row.getByRole('button',{name:action,exact:true}).click();
      await row.getByText(action==='Clear'?'Built-in fallback':'Saved',{exact:true}).waitFor();
    }
    assert.equal(await page.evaluate(()=>window.fixture.calls.filter(c=>c.method==='delete').at(-1).url),'/reseller/bot-content/guides.shadowsocks.url');
    await input.fill('');await row.getByRole('button',{name:'Save',exact:true}).click();await row.getByText('Saved',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.calls.filter(c=>c.method==='patch').at(-1).body.text),'');
    for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}px`);
      for(const label of ['Shadowsocks','VLESS']){
        const bounds=await page.getByRole('textbox',{name:`${label} URL`,exact:true}).boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,`${label} at ${width}px`);
      }
      await page.screenshot({path:path.join(output,`bot-links-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);console.log(`Bot Links screenshots: ${output}`);
  }finally{await browser.close();}
});

test('dirty rows and pending mutations guard navigation; load errors can retry',async()=>{
  const browser=await launch();
  try{
    const page=await open(browser),row=page.getByRole('region',{name:'Shadowsocks',exact:true});
    await row.getByRole('textbox').fill('https://t.me/novanetmm/draft');
    assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);
    page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'Notifications',exact:true}).click();
    assert.equal(await row.getByRole('textbox').inputValue(),'https://t.me/novanetmm/draft');
    await page.evaluate(()=>window.fixture.defer='patch');await row.getByRole('button',{name:'Save',exact:true}).click();
    await page.waitForFunction(()=>window.fixture.pending?.length===1);await page.getByRole('link',{name:'Notifications',exact:true}).click();
    assert.equal(new URL(page.url()).pathname,'/app/bot-links');await page.evaluate(()=>window.fixture.pending[0]());await row.getByText('Saved',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'VLESS URL',exact:true}).fill('https://t.me/novanetmm/ios-draft');
    await row.getByRole('textbox').fill('https://t.me/novanetmm/second');await page.evaluate(()=>window.fixture.defer=null);
    await row.getByRole('button',{name:'Save',exact:true}).click();await row.getByText('Saved',{exact:true}).waitFor();
    page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'Notifications',exact:true}).click();
    assert.equal(new URL(page.url()).pathname,'/app/bot-links');
    page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'Notifications',exact:true}).click();await page.getByRole('heading',{name:'Notification editor'}).waitFor();
    const failure=await open(browser,'/app/bot-links',{loadFail:true});await failure.getByRole('alert').filter({hasText:'Fixture rejected link'}).waitFor();
    assert.equal(await failure.getByRole('textbox').count(),0);await failure.evaluate(()=>{window.fixture.loadFail=false;window.fixture.items=[];});
    await failure.getByRole('button',{name:'Retry',exact:true}).click();await failure.getByText('No links available',{exact:true}).waitFor();
  }finally{await browser.close();}
});

test('switching tenants removes dirty drafts and ignores a pending save in the page',async()=>{
  const browser=await launch();
  try{
    const page=await open(browser);
    const android=page.getByRole('region',{name:'Shadowsocks',exact:true});
    await android.getByRole('textbox').fill('https://old.example.com/draft');
    await page.getByRole('textbox',{name:'VLESS URL',exact:true}).fill('https://old.example.com/ios-draft');
    await page.evaluate(()=>window.fixture.defer='patch');
    await android.getByRole('button',{name:'Save',exact:true}).click();
    await page.waitForFunction(()=>window.fixture.pending?.length===1);
    await page.evaluate(()=>{
      window.fixture.defer=null;
      window.fixture.items=window.fixture.items.map(i=>({...i,text:'https://new.example.com'}));
      window.setFixtureAuth({sessionId:'tenant-b'});
    });
    await page.waitForFunction(()=>[...document.querySelectorAll('input')].length===2&&[...document.querySelectorAll('input')].every(i=>i.value==='https://new.example.com'));
    await page.evaluate(()=>window.fixture.pending[0]());
    // Allow any late React update to commit before checking the visible rows.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(await page.getByRole('textbox').evaluateAll(inputs=>inputs.map(i=>i.value)),Array(2).fill('https://new.example.com'));
    assert.equal(await page.getByText('Unsaved changes',{exact:true}).count(),0);
    assert.equal(await page.getByRole('alert').count(),0);
    assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false);
  }finally{await browser.close();}
});

test('stale loads and mutations cannot cross tenants, logout, unmount or storage changes',async()=>{
  const browser=await launch();
  try{
    for(const action of ['save','reset','reload'])for(const transition of ['switch','logout','unmount','storage']){
      const page=await open(browser,'/hook');await page.waitForFunction(()=>window.hook?.items.length===2&&!window.hook.loading);
      await page.evaluate(action=>{window.fixture.defer={save:'patch',reset:'delete',reload:'get'}[action];window.oldAction=window.hook[action];window.hook[action]('guides.shadowsocks.url','https://old.example.com').then(()=>window.outcome='accepted',()=>window.outcome='discarded');},action);
      await page.waitForFunction(()=>window.fixture.pending?.length===1);
      await page.evaluate(transition=>{
        if(transition==='unmount'){window.fixtureNavigate('/app/notifications');return;}
        if(transition==='storage'){window.dispatchEvent(new StorageEvent('storage',{key:'rnv_uid',newValue:'tenant-b'}));return;}
        window.fixture.defer=null;window.fixture.items=window.fixture.items.map(i=>({...i,text:'https://new.example.com'}));
        window.setFixtureAuth(transition==='logout'?{isAuthenticated:false,sessionId:null}:{sessionId:'tenant-b'});
      },transition);
      if(transition==='switch')await page.waitForFunction(()=>window.hook.items[0]?.text==='https://new.example.com'&&!window.hook.loading);
      if(transition==='logout'||transition==='storage')await page.waitForFunction(()=>window.hook.items.length===0);
      if(transition==='unmount')await page.getByRole('heading',{name:'Notification editor'}).waitFor();
      await page.evaluate(()=>window.fixture.pending[0]());await page.waitForFunction(()=>window.outcome);
      if(action!=='reload')assert.equal(await page.evaluate(()=>window.outcome),'discarded',`${action}/${transition}`);
      if(transition==='switch'){
        assert.equal(await page.evaluate(()=>window.hook.items[0].text),'https://new.example.com');
        await page.evaluate(async()=>{const count=window.fixture.calls.length;try{await window.oldAction('guides.shadowsocks.url','https://stale.example.com');}catch{}window.staleCalled=window.fixture.calls.length!==count;});
        assert.equal(await page.evaluate(()=>window.staleCalled),false);
      }
      if(transition==='logout'||transition==='storage')assert.equal(await page.evaluate(()=>window.hook.items.length),0);
      await page.close();
    }
  }finally{await browser.close();}
});
