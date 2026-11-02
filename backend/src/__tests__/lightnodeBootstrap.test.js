import { EventEmitter } from 'node:events';
import ssh2 from 'ssh2';
import { describe, expect, it, vi } from 'vitest';
import { makeLightNodeBootstrap, observeLightNodeHostKey, hardenLightNodeSsh } from '../services/infrastructure/lightnodeBootstrap.js';
import { createInfrastructureContext } from '../services/infrastructure/context.js';

const fingerprint = `SHA256:${Buffer.alloc(32, 1).toString('base64').replace(/=+$/, '')}`;
const privateKey = ssh2.utils.generateKeyPairSync('ed25519').private;
async function fixture() {
  const scope={environment:'development',databaseIdentity:'db',panelIdentity:'panel',poolId:'pool'};
  const config={...scope,executionMode:'mock',providerAccounts:{lightnode:'connection'},protectedResourceIds:['live'],protectedAddresses:['192.0.2.1']};
  const resource={...scope,kind:'provider',id:'ecs-new',provider:'lightnode',accountId:'connection',operationId:'op',protected:false,
    createdAt:'2026-11-01T00:00:00Z',addresses:['198.51.100.9'],sshHostKeySha256:fingerprint};
  const context=await createInfrastructureContext({config,registry:{getResource:async()=>resource},adapters:{inspectRuntime:async()=>({...config,verified:true}),assertOperationLease:async()=>true}});
  const states=new Map(), events=[];
  const store={readState:async key=>states.get(key)||{value:null,version:null},saveState:vi.fn(async(key,value,version)=>{
    expect(states.get(key)?.version??null).toBe(version);states.set(key,{value:structuredClone(value),version:(version||0)+1});events.push(`save:${key}`);
  })};
  const sessions=[];
  const sessionFactory=vi.fn(async options=>{
    events.push(options.password?'password-login':'key-login');
    const session={exec:vi.fn(async command=>{events.push(command);return command.includes('sshd -T')?'passwordauthentication no\nkbdinteractiveauthentication no\npubkeyauthentication yes\npermitrootlogin prohibit-password\n':'';}),close:vi.fn()};
    sessions.push(session);return session;
  });
  return {context,resource,operation:{id:'op',owner:'worker',fence:1},bootstrap:{...makeLightNodeBootstrap(),fingerprint},store,states,events,sessions,sessionFactory,privateKey,renewLease:vi.fn(async()=>{})};
}
describe('LightNode first-contact bootstrap',()=>{
  it('generates unique provider-compliant passwords without cloud-init claims',()=>{
    const values=Array.from({length:20},makeLightNodeBootstrap);
    expect(new Set(values.map(x=>x.password)).size).toBe(20);
    for(const value of values){expect(value.password).toMatch(/^[A-Fa-f0-9]{22}Aa9!$/);expect(value.userData).toBeUndefined();expect(value.fingerprint).toBeUndefined();expect(value.mode).toBe('password-tofu');}
  });
  it('observes an ed25519 host key without authenticating or sending any password',async()=>{
    const client=new EventEmitter();client.end=vi.fn();client.connect=vi.fn(options=>{
      expect(options.password).toBeUndefined();expect(options.privateKey).toBeUndefined();
      expect(options.hostVerifier('01'.repeat(32))).toBe(false);
      queueMicrotask(()=>client.emit('error',Error('rejected host intentionally')));
    });
    expect(await observeLightNodeHostKey({host:'198.51.100.9',clientFactory:()=>client})).toBe(fingerprint);
    expect(client.end).toHaveBeenCalledOnce();
  });
  it('installs key, verifies independent key login, disables password then verifies effective policy',async()=>{
    const f=await fixture();await hardenLightNodeSsh(f);
    expect(f.sessionFactory.mock.calls.map(([o])=>Boolean(o.password))).toEqual([false]);
    // A node already accepting the operator key resumes directly; no password exposure.
    expect(f.states.get('lightnode-ssh')?.value).toMatchObject({resourceId:'ecs-new',fingerprint,completed:true});
    expect(f.events.some(x=>x.includes('PasswordAuthentication no'))).toBe(true);
    expect(f.events.some(x=>x.includes('sshd -T'))).toBe(true);
    expect(f.sessions.every(x=>x.close.mock.calls.length===1)).toBe(true);
  });
  it('uses temporary password only when pinned key login is not yet available',async()=>{
    const f=await fixture();f.sessionFactory.mockRejectedValueOnce(Object.assign(Error('auth'),{code:'SSH_CONNECTION_FAILED'}));
    await hardenLightNodeSsh(f);
    expect(f.sessionFactory.mock.calls.map(([o])=>Boolean(o.password))).toEqual([false,true,false]);
    const passwordCommands=f.sessions[0].exec.mock.calls.map(([cmd])=>cmd);
    expect(passwordCommands.some(cmd=>cmd.includes('authorized_keys'))).toBe(true);
    expect(passwordCommands.every(cmd=>!cmd.includes(f.bootstrap.password))).toBe(true);
    expect(f.events.indexOf('key-login',f.events.indexOf('password-login'))).toBeLessThan(f.events.findIndex(x=>x.includes('PasswordAuthentication no')));
  });
  it('does not harden after key installation if the independent key login fails',async()=>{
    const f=await fixture(),factory=f.sessionFactory;
    factory.mockRejectedValueOnce(Object.assign(Error('auth'),{code:'SSH_CONNECTION_FAILED'}));
    const normal=factory.getMockImplementation();factory.mockImplementationOnce(normal);
    factory.mockRejectedValueOnce(Object.assign(Error('auth'),{code:'SSH_CONNECTION_FAILED'}));
    await expect(hardenLightNodeSsh(f)).rejects.toMatchObject({code:'NODE_BOOTSTRAP_PENDING'});
    expect(f.events.some(x=>x.includes('PasswordAuthentication no'))).toBe(false);
    await hardenLightNodeSsh(f);expect(f.states.get('lightnode-ssh').value.completed).toBe(true);
  });
  it('rejects wrong pin or resource checkpoint instead of re-enrolling another host',async()=>{
    const f=await fixture();f.states.set('lightnode-ssh',{value:{resourceId:'other',fingerprint,completed:true},version:1});
    await expect(hardenLightNodeSsh(f)).rejects.toMatchObject({code:'NODE_CONFIGURATION_CHANGED'});
    expect(f.sessionFactory).not.toHaveBeenCalled();
  });
  it('blocks protected or scope-mismatched resources before opening SSH',async()=>{
    const f=await fixture();f.resource.protected=true;
    await expect(hardenLightNodeSsh(f)).rejects.toMatchObject({code:'PROTECTED_RESOURCE'});
    expect(f.sessionFactory).not.toHaveBeenCalled();
  });
  it('fails closed when effective sshd configuration still allows password login',async()=>{
    const f=await fixture();f.sessionFactory.mockImplementation(async()=>({exec:async command=>command.includes('sshd -T')?'passwordauthentication yes\n':'',close:vi.fn()}));
    await expect(hardenLightNodeSsh(f)).rejects.toMatchObject({code:'NODE_SSH_HARDENING_UNVERIFIED'});
    expect(f.states.get('lightnode-ssh')?.value.completed).not.toBe(true);
  });
  it('does not leak transport errors or the temporary password',async()=>{
    const f=await fixture();f.sessionFactory.mockRejectedValue(Error(`credential ${f.bootstrap.password}`));
    await expect(hardenLightNodeSsh(f)).rejects.toThrow('NODE_BOOTSTRAP_PENDING');
  });
});
