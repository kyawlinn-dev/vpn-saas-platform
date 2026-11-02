import {describe,it,expect,vi} from 'vitest';
import ssh2 from 'ssh2';
import {createProviderSetup} from '../services/infrastructure/providers/providerSetup.js';

function fixture(provider='digitalocean') {
  const pair=ssh2.utils.generateKeyPairSync('ed25519');
  const publicKey=ssh2.utils.parseKey(pair.public).getPublicSSH();
  const machine={image:'ubuntu-22-04-x64',osId:1743,sshKeyIds:['key'],firewallId:'firewall',firewallTag:'dev'};
  const rules=[22,62050,443].map(port=>({protocol:'tcp',ports:String(port),sources:{addresses:port===443?['0.0.0.0/0']:['192.0.2.2/32']}}));
  const transport={request:vi.fn(async({path})=>({status:200,data:provider==='vultr'?{firewall_rules:rules.map(r=>({action:'accept',protocol:r.protocol,port:r.ports,subnet:r.ports==='443'?'0.0.0.0':'192.0.2.2',subnet_size:r.ports==='443'?0:32})),meta:{}}:{firewall:{id:'firewall',tags:['dev'],inbound_rules:rules}}}))};
  const catalog={list:vi.fn(async path=>path==='/v2/os'?[{id:1743,name:'Ubuntu 22.04 x64',arch:'x64',family:'ubuntu'}]:[{id:'key',public_key:pair.public,ssh_key:pair.public}]),get:vi.fn(async()=>({image:{distribution:'Ubuntu',slug:machine.image,regions:['sgp1'],status:'available'}}))};
  const config={machines:{vless_only:machine}};
  return {pair,publicKey,machine,transport,catalog,config,setup:()=>createProviderSetup({provider,config,catalog,transport,managementSources:['192.0.2.2'],publicKey})};
}
describe('provider bootstrap readiness',()=>{
  it('validates SSH, firewall and region image before a purchase',async()=>{
    const f=fixture();
    expect(await f.setup().inspect()).toMatchObject({ready:true,profiles:['vless_only']});
    expect(await f.setup().resolveMachine({region:'sgp1',profile:'vless_only'})).toMatchObject({image:'ubuntu-22-04-x64'});
    await expect(f.setup().resolveMachine({region:'nyc1',profile:'vless_only'})).rejects.toMatchObject({code:'PROVIDER_IMAGE_UNAVAILABLE'});
    expect(f.transport.request.mock.calls.every(([row])=>row.method==='GET')).toBe(true);
  });
  it('requires a matching key rather than presence of an arbitrary key ID',async()=>{
    const f=fixture();f.catalog.list.mockResolvedValue([{id:'key',public_key:ssh2.utils.generateKeyPairSync('ed25519').public}]);
    expect(await f.setup().inspect()).toMatchObject({ready:false,reason:'PROVIDER_SSH_KEY_UNAVAILABLE'});
  });
  it('counts a valid regional-only profile as ready without authorizing another region', async () => {
    const f = fixture();
    f.config.regionalMachines = { sgp1: { vless_only: f.machine } };
    delete f.config.machines;
    expect(await f.setup().inspect()).toMatchObject({ ready: true, profiles: ['vless_only'] });
    await expect(f.setup().resolveMachine({ region: 'sgp1', profile: 'vless_only' })).resolves.toMatchObject({ image: f.machine.image });
    await expect(f.setup().resolveMachine({ region: 'nyc1', profile: 'vless_only' })).rejects.toMatchObject({ code: 'PROVIDER_CONFIGURATION_REQUIRED' });
  });
  it('validates Vultr OS architecture and supports regional profile overrides',async()=>{
    const f=fixture('vultr');
    expect(await f.setup().resolveMachine({region:'sgp',profile:'vless_only'})).toMatchObject({osId:1743});
    f.catalog.list.mockImplementation(async path=>path==='/v2/os'?[{id:1743,name:'Ubuntu ARM',arch:'aarch64',family:'ubuntu'}]:[{id:'key',ssh_key:f.pair.public}]);
    await expect(f.setup().resolveMachine({region:'sgp',profile:'vless_only'})).rejects.toMatchObject({code:'PROVIDER_IMAGE_UNAVAILABLE'});
  });
  it('returns safe reasons without exposing provider errors',async()=>{
    const f=fixture();f.transport.request.mockRejectedValue(new Error('secret-token'));
    expect(await f.setup().inspect()).toMatchObject({ready:false,reason:'FIREWALL_POLICY_UNVERIFIED'});
  });
});
