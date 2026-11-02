import {infrastructureError} from '../repository.js';
import {verifyProviderFirewall} from '../liveFirewall.js';
import {matchesSshPublicKey} from '../liveSsh.js';

const fail=code=>{throw infrastructureError(code);};
const profiles=['dual','vless_only'];
export function createProviderSetup({provider,config,catalog,transport,managementSources,publicKey}) {
  async function check(machine,profile) {
    if(!profiles.includes(profile) || !machine || !Array.isArray(machine.sshKeyIds) || !machine.sshKeyIds.length ||
      !machine.firewallId || (provider==='digitalocean' && (!machine.image || !machine.firewallTag))) fail('PROVIDER_CONFIGURATION_REQUIRED');
    let keys;
    try {keys=await catalog.list(provider==='digitalocean'?'/v2/account/keys':'/v2/ssh-keys','ssh_keys');}
    catch {fail('PROVIDER_SSH_KEY_UNAVAILABLE');}
    const selected=keys.filter(key=>machine.sshKeyIds.some(id=>String(key.id)===String(id)||key.fingerprint===id));
    if(!machine.sshKeyIds.every(id=>selected.some(key=>String(key.id)===String(id)||key.fingerprint===id)) ||
      !selected.some(key=>matchesSshPublicKey(provider==='vultr'?key.ssh_key:key.public_key,publicKey))) fail('PROVIDER_SSH_KEY_UNAVAILABLE');
    try {if(await verifyProviderFirewall({provider,transport,machine,managementSources,profile})!==true)fail('FIREWALL_POLICY_UNVERIFIED');}
    catch {fail('FIREWALL_POLICY_UNVERIFIED');}
    return structuredClone(machine);
  }
  async function inspect() {
    const enabled=[],reasons={};
    for(const profile of profiles) {
      const candidates=[config?.machines?.[profile],...Object.values(config?.regionalMachines||{}).map(row=>row?.[profile])].filter(Boolean);
      for(const candidate of candidates.length?candidates:[null]) {
        try {await check(candidate,profile);enabled.push(profile);delete reasons[profile];break;}
        catch(error) {reasons[profile]=['PROVIDER_CONFIGURATION_REQUIRED','PROVIDER_SSH_KEY_UNAVAILABLE','FIREWALL_POLICY_UNVERIFIED'].includes(error.code)?error.code:'PROVIDER_CONFIGURATION_REQUIRED';}
      }
    }
    return {ready:enabled.length>0,reason:enabled.length?null:reasons.vless_only,profiles:enabled,profile_reasons:reasons};
  }
  async function resolveMachine({region,profile}) {
    if(typeof region!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(region)) fail('INVALID_OPERATION_INPUT');
    const machine=await check(config?.regionalMachines?.[region]?.[profile] || config?.machines?.[profile],profile);
    try {
      if(provider==='digitalocean') {
        const {image}=await catalog.get(`/v2/images/${encodeURIComponent(machine.image)}`);
        if(!image || image.distribution!=='Ubuntu' || !['amd64','x86_64','x64'].includes(image.architecture) && !/-x64$/.test(image.slug||'') ||
          image.status!=='available' || !Array.isArray(image.regions) || !image.regions.includes(region)) fail('PROVIDER_IMAGE_UNAVAILABLE');
      } else {
        const rows=await catalog.list('/v2/os','os');
        const candidates=rows.filter(os=>os.family==='ubuntu' && os.arch==='x64' && /Ubuntu (22\.04|24\.04)/i.test(os.name));
        const os=machine.osId?candidates.find(os=>Number(os.id)===Number(machine.osId)):candidates.find(os=>/22\.04/.test(os.name));
        if(!os) fail('PROVIDER_IMAGE_UNAVAILABLE');
        machine.osId=Number(os.id);
      }
    } catch {fail('PROVIDER_IMAGE_UNAVAILABLE');}
    return machine;
  }
  return Object.freeze({inspect,resolveMachine});
}
