import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {summarizeOrderBusiness} from '../../backend/src/services/businessDisplayService.js';
export function validateBaseUrls(urls) {for(const raw of urls){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password)throw new Error('Only loopback browser targets are allowed');}}
export async function run() {
 const bases=[process.env.ADMIN_BASE_URL||'http://127.0.0.1:3001',process.env.RESELLER_BASE_URL||'http://127.0.0.1:3002',process.env.MINIAPP_BASE_URL||'http://127.0.0.1:3003'];validateBaseUrls(bases);
 const fixture=JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/business-displays.json',import.meta.url)));
 const plan={id:'plan-a',name:'100 GB Package',price_mmk:5000,duration_days:30,data_limit_gb:100,max_devices:2,is_active:true};
 const order={...fixture.switched.order,customer:{id:'customer-a',full_name:'Fixture Customer',customer_type:'normal'},reseller:{id:'tenant-a',name:'Fixture Brand'},plan,quota:fixture.switched.quota,keys:fixture.switched.keys,total_used_bytes:78739049472,payments:[],business_summary:summarizeOrderBusiness(fixture.switched.order,{quota:fixture.switched.quota,now:new Date(fixture.now_iso),paymentsLoaded:true}),money_summary:{basis:'ledger',recognized_gross_mmk:0,commission_mmk:0,platform_due_mmk:0,awaiting_review_mmk:0}};
 const browser=await chromium.launch({headless:true});
 try {for(const [index,base] of bases.slice(0,2).entries()){
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'});const page=await context.newPage();const unexpected=[];page.setDefaultTimeout(12000);page.on("pageerror",e=>console.error("Browser error:",e.message));
 await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.pathname.startsWith('/api/')){
 let body;const p=u.pathname;
 if(p.endsWith('/auth/reseller/me')||p.endsWith('/admin/auth/me'))body={user:{id:'test-user'},admin:{id:'test-admin',full_name:'Fixture Admin'}};
 else if(p.endsWith('/plans'))body=[plan];
 else if(p.endsWith('/resellers'))body=[order.reseller];
 else if(p.endsWith('/servers'))body={success:true,servers:[]};
 else if(p.endsWith('/reseller/me'))body={...order.reseller,status:'active',has_miniapp:true};
 else if(p.endsWith('/workspace'))body={brand_name:'Fixture Brand',is_enabled:true};
 else if(p.endsWith('/orders/counts'))body={status:{all:1,active:1},telegram_review:{total:0,pending:0}};
 else if(p.endsWith('/orders'))body={data:[order],total:1,page:1,limit:10};
 else {unexpected.push(req.method()+' '+p);await route.abort();return;}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
 }
 if(u.hostname==='fonts.googleapis.com'){await route.fulfill({status:200,contentType:'text/css',body:''});return;}
 if(u.origin===new URL(base).origin){await route.continue();return;} unexpected.push(req.url());await route.abort();});
 console.log("Checking",base);await page.goto(base+(index===0?'/orders':'/app/orders'));await page.getByText('Fixture Customer',{exact:true}).first().waitFor();
 if(index===1){await page.getByRole('button',{name:'More actions',exact:true}).first().click();await page.getByText('View details',{exact:true}).click();}
 const text=await page.locator('body').innerText();assert.match(text,/100\.00 GB/);assert.match(text,/73%/);assert.match(text,/26\.67 GB/);assert.equal(unexpected.length,0,'Unmatched requests: '+unexpected.join(','));
 console.log((index===0?'admin':'reseller')+': switched package shows full total — passed');await context.close();
 }}finally{await browser.close();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1]))run().catch(error=>{console.error(error);process.exitCode=1;});
