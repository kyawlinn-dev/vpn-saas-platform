import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), 'novanet-task5-layout-'));
const assets = await readdir(path.join(root, 'dist/assets'));
const css = await readFile(path.join(root, 'dist/assets', assets.find(name => name.endsWith('.css'))), 'utf8');
const quote = { id: 'quote', kind: 'add', source_server_id: null, destination_server_id: null, supported_protocols: ['vless'], temporary_billing_overlap: false, expiresAt: '2099-01-01', price: { provider: 'vultr', region: 'ams', planId: 'vc2-1c-0.5gb', recurringAmount: 12, currency: 'USD', trafficTerms: { included: 2, unit: 'TB', overageAmount: null } } };
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import { createRoot } from 'react-dom/client';
    import { ServerOperationDialog } from './src/components/servers/ServerOperationDialog';
    import { ServersPage } from './src/pages/ServersPage';
    const readiness = [{id:'digitalocean',ready:false,reason:'PROVIDER_CONFIGURATION_REQUIRED',profiles:[]},{id:'vultr',ready:true,reason:null,profiles:['dual','vless_only']}];
    const root = createRoot(document.getElementById('root'));
    window.showDialog = () => root.render(<ServerOperationDialog mode="add" servers={[]} providerReadiness={readiness} onClose={()=>{}} onCreated={()=>{throw Error('Unexpected purchase')}} />);
    window.showRecovery = () => {
      sessionStorage.setItem('novanet:pending-server-operation', JSON.stringify({key:'original',request:{quote_id:'quote'},quote:${JSON.stringify(quote)},choice:{kind:'add',provider:'vultr'}}));
      root.render(<ServersPage servers={[]} onSuccess={async()=>{}} />);
    };
    window.showDialog();
  ` },
  plugins: [{ name: 'offline-catalogue', setup(builder) {
    builder.onResolve({ filter: /^@\/features\/serverOperations\/api$/ }, () => ({ path: 'catalogue', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const serverOperationsApi = {
      list: async () => ({enabled:false,reason:'RUNTIME_UNAVAILABLE',public_access_enabled:true,operations:[],provider_readiness:[]}),
      catalog: async ({provider,region}) => region
        ? {provider,region,plans:[{id:'vc2-1c-0.5gb',label:'General compute with a very long provider plan label',cpu:2,memory_mb:2048,disk_gb:50,transfer:{included:2,unit:'TB'},price:{monthly:12,hourly:0.018,currency:'USD'},available:true,compatible:true,reason:null,architecture:'x86_64',family:'general'}],observed_at:'2026-10-27T08:00:00Z',stale:true}
        : {provider,regions:[{id:'ams',label:'Amsterdam, Netherlands',available:true}],observed_at:'2026-10-27T08:00:00Z',stale:false},
      quote: async () => (${JSON.stringify(quote)}),
      create: async () => { throw Error('Unexpected purchase'); }
    };` }));
  } }],
});
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><div id="root"></div></body></html>' }) : route.abort());
    await page.goto('https://task5.invalid');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel('Region', { exact: true }).selectOption('ams');
    await page.getByLabel('Plan', { exact: true }).selectOption('vc2-1c-0.5gb');
    await page.screenshot({ path: path.join(output, `catalogue-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Review Quote' }).click();
    await page.getByLabel('Approve recurring cost').check();
    await page.getByRole('button', { name: 'Add Server', exact: true }).scrollIntoViewIfNeeded();
    const geometry = await page.getByRole('dialog').evaluate(dialog => {
      const bounds = dialog.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, overflow: dialog.scrollWidth > dialog.clientWidth };
    });
    assert(geometry.left >= 0 && geometry.right <= viewport.width && geometry.top >= 0 && geometry.bottom <= viewport.height, JSON.stringify({ viewport, geometry }));
    assert.equal(geometry.overflow, false);
    await page.screenshot({ path: path.join(output, `dialog-${viewport.width}.png`), fullPage: true });
    await page.evaluate(() => window.showRecovery());
    await page.getByRole('button', { name: 'Recover pending submission' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `Recovery toolbar overflows at ${viewport.width}px`);
    const wrappedLabels = await page.getByRole('button', { name: /Recover pending submission|Add Server/ }).evaluateAll(buttons => buttons.filter(button => Array.from(button.childNodes).some(node => {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
      const range = document.createRange(); range.selectNodeContents(node);
      return range.getClientRects().length > 1;
    })).map(button => button.textContent));
    assert.deepEqual(wrappedLabels, [], `Toolbar labels wrap at ${viewport.width}px`);
    await page.screenshot({ path: path.join(output, `recovery-${viewport.width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`Desktop/mobile layout checks passed. Screenshots: ${output}`);
} finally { await browser.close(); }
