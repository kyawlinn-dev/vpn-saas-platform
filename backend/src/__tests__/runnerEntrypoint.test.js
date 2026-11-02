import {describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
describe('runner symlink release entrypoint',()=>{
  it('executes startup through a current-release symlink and fails closed on missing configuration',async()=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'novanet-runner-entry-test-'));
    try {
      const target=fileURLToPath(new URL('../',import.meta.url));
      await fs.symlink(target,path.join(directory,'current'),process.platform==='win32'?'junction':'dir');
      const env={...process.env};delete env.SERVER_RUNNER_ENV_FILE;
      const r=spawnSync(process.execPath,[path.join(directory,'current/infrastructureRunner.js')],{env,cwd:directory,encoding:'utf8',timeout:10000});
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('DEV infrastructure runner startup failed');
    }finally{
      if(!path.basename(directory).startsWith('novanet-runner-entry-test-'))throw Error('Invalid test directory');
      await fs.rm(directory,{recursive:true,force:true});
    }
  });
});
