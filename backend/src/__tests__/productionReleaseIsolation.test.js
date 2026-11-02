import fs from 'node:fs';
import path from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
vi.mock('../lib/supabase.js',()=>({supabase:{}}));
vi.mock('../services/orderLifecycleService.js',()=>({activatePendingReviewPurchase:vi.fn()}));
vi.mock('../services/paymentLedgerService.js',()=>({syncOrderPaymentSummary:vi.fn()}));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
describe('production release dependency boundary',()=>{
 it('contains no deferred runtime modules or imports in server/dashboard code',()=>{
  expect(fs.existsSync(path.join(root,'backend/src/messenger'))).toBe(false);
  expect(fs.existsSync(path.join(root,'backend/src/services/announcements'))).toBe(false);
  const runtime=['backend/src','reseller-dashboard/src'].flatMap(p=>files(path.join(root,p))).filter(p=>/\.(js|jsx|ts|tsx)$/.test(p)&&!p.includes('__tests__')&&!/\.test\./.test(p));
  for(const file of runtime){const text=fs.readFileSync(file,'utf8');expect(text,path.relative(root,file)).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*(?:messenger|announcements)/i);}
  expect(fs.readFileSync(path.join(root,'backend/src/server.js'),'utf8')).not.toMatch(/messenger|announcements/i);
  expect(fs.readFileSync(path.join(root,'reseller-dashboard/src/App.tsx'),'utf8')).not.toMatch(/AnnouncementsPage|path="announcements"/);
  expect(fs.readFileSync(path.join(root,'reseller-dashboard/src/components/layout/AppShell.tsx'),'utf8')).not.toMatch(/announcements/i);
 });
 it('does not query deferred channel tables or expose their frontend controls',()=>{
  for(const file of files(path.join(root,'backend/src')).filter(p=>p.endsWith('.js')&&!p.includes('__tests__'))){
   expect(fs.readFileSync(file,'utf8'),path.relative(root,file)).not.toMatch(/\.from\(["'](?:messenger_|announcement_)/i);
  }
  for(const dir of ['admin-dashboard/src','reseller-dashboard/src'])for(const file of files(path.join(root,dir)).filter(p=>/\.(js|jsx|ts|tsx)$/.test(p)&&!p.includes('__tests__')&&!/\.test\./.test(p))){
   expect(fs.readFileSync(file,'utf8'),path.relative(root,file)).not.toMatch(/messenger|announcements/i);
  }
  expect(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'backend/package.json'),'utf8')).scripts).some(k=>/messenger|announcement/i.test(k))).toBe(false);
 });
 it('preserves deployed 0039 while omitting mixed development/unfinished migrations',()=>{
  const migrations=fs.readdirSync(path.join(root,'backend/supabase/migrations'));
  expect(migrations).toContain('0039_dashboard_purchase_payment_split.sql');
  expect(migrations.some(n=>/^00(2[7-9]|3[0-6])_/.test(n))).toBe(false);
  expect(migrations.some(n=>n.startsWith('0059_'))).toBe(false);
 });
 it('omits operator LAN helpers and keeps test fixtures out of backend deployment',()=>{
  expect(fs.existsSync(path.join(root,'reseller-dashboard/scripts/allow-phone-access.ps1'))).toBe(false);
  expect(fs.readFileSync(path.join(root,'reseller-dashboard/vite.config.ts'),'utf8')).not.toContain('DEV_DASHBOARD_LAN');
  expect(fs.readFileSync(path.join(root,'ansible/deploy.yml'),'utf8')).toContain('--exclude=src/__tests__/');
 });
 it('accepts Telegram checkout and rejects an excluded channel before storage',async()=>{
  const {createPurchaseService}=await import('../services/purchaseService.js');
  const submit=createPurchaseService({prepare:()=>{throw new Error('storage reached');}});
  await expect(submit({actor:{role:'customer',resellerId:'r'},channel:'messenger',customerId:'c',planId:'p',screenshotPath:'receipt'})).rejects.toMatchObject({code:'INVALID_CALLER'});
 });
});
