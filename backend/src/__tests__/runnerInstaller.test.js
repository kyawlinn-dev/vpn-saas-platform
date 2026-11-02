import {describe,expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const installer=readFileSync(new URL('./fixtures/install-dev-runner.sh',import.meta.url),'utf8');
describe.skipIf(!existsSync(bash))('isolated installer collision guards',()=>{
  it.each(['novanet-dev-runner','novanet-dev-link','service'])('rejects existing %s before any resource change',collision=>{
    const input=`id(){ printf '0'; }
getent(){ [[ "$2" == '${collision}' ]]; }
systemctl(){ [[ '${collision}' == service ]]; }
install(){ echo RESOURCE_CHANGE; exit 44; }
useradd(){ echo RESOURCE_CHANGE; exit 44; }
${installer.replace('base=/opt/novanet-dev-runner','base=/nonexistent-novanet-fixture').replace('config=/etc/novanet-dev-runner','config=/nonexistent-novanet-fixture-config')}`;
    const r=spawnSync(bash,['--noprofile','--norc','-s','--','prepare'],{input,encoding:'utf8',timeout:10000});
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('RESOURCE_CHANGE');
    expect(r.stderr).toContain('RUNNER_');
  });
});
