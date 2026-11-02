import {describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
describe('standalone runner environment isolation',()=>{
  it('explicit isolation skips generic dotenv files even from an existing checkout',()=>{
    const output=execFileSync(process.execPath,['--input-type=module','-e',
      "await import('./src/lib/loadEnv.js');console.log(process.env.VULTR_API_KEY==='fixture-only'?'isolated':'overwritten');"],
      {cwd:new URL('../../',import.meta.url),env:{...process.env,NOVANET_ENV_LOADING_DISABLED:'true',NODE_ENV:'development',VULTR_API_KEY:'fixture-only'},encoding:'utf8'});
    expect(output.trim()).toBe('isolated');
  });
});
