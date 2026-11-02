import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import ssh2 from 'ssh2';
import { assertOperationAuthority, assertResourceOwnership } from './ownership.js';
import { infrastructureError } from './repository.js';
import { connectStrictInfrastructureSsh } from './liveSsh.js';

const fail=code=>{throw infrastructureError(code);};
const validPin=value=>/^SHA256:[A-Za-z0-9+/]{43}$/.test(value||'');
export function makeLightNodeBootstrap() {
  return {mode:'password-tofu',password:randomBytes(11).toString('hex')+'Aa9!'};
}

/** Observe only: reject the SSH handshake before any authentication takes place.
 * The caller must persist this explicit TOFU evidence before password login.
 */
export async function observeLightNodeHostKey({host,clientFactory=()=>new ssh2.Client(),readyTimeout=20000}) {
  if(!isIP(host)||!Number.isFinite(readyTimeout)||readyTimeout<1000||readyTimeout>30000)fail('NODE_SECURITY_CONFIGURATION_REQUIRED');
  const client=clientFactory();
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer);client.end();
      if(error)reject(infrastructureError(error));else resolve(value);
    };
    const timer=setTimeout(()=>finish('NODE_BOOTSTRAP_PENDING'),readyTimeout+1000);
    client.on('error',()=>finish('NODE_BOOTSTRAP_PENDING'));
    client.on('end',()=>finish('NODE_BOOTSTRAP_PENDING'));
    try {client.connect({host,username:'root',readyTimeout,algorithms:{serverHostKey:['ssh-ed25519']},hostHash:'sha256',
      hostVerifier:hash=>{
        if(typeof hash!=='string'||!/^[a-f0-9]{64}$/i.test(hash)){finish('NODE_SECURITY_CONFIGURATION_REQUIRED');return false;}
        finish(null,`SHA256:${Buffer.from(hash,'hex').toString('base64').replace(/=+$/,'')}`);return false;
      }});
    }catch{finish('NODE_BOOTSTRAP_PENDING');}
  });
}

/** Fresh operation-owned LightNode only. Key authentication is proven on a new
 * connection before password access is disabled. Every retry keeps the same pin.
 */
export async function hardenLightNodeSsh({context,operation,resource,bootstrap,store,privateKey,renewLease,
  sessionFactory=connectStrictInfrastructureSsh}) {
  await assertResourceOwnership({context,resource,operation});
  if(resource.provider!=='lightnode'||resource.operationId!==operation.id||bootstrap?.mode!=='password-tofu'||
    !/^[a-f0-9]{22}Aa9!$/.test(bootstrap.password||'')||!validPin(bootstrap.fingerprint)||
    resource.sshHostKeySha256!==bootstrap.fingerprint)fail('NODE_SECURITY_CONFIGURATION_REQUIRED');
  const address=resource.addresses?.find(value=>isIP(value)===4);
  if(!address)fail('NODE_ADDRESS_UNAVAILABLE');
  const parsed=ssh2.utils.parseKey(privateKey);
  if(parsed instanceof Error||Array.isArray(parsed)||!parsed?.isPrivateKey?.())fail('INFRASTRUCTURE_SSH_KEY_UNAVAILABLE');
  const publicLine=`${parsed.type} ${parsed.getPublicSSH().toString('base64')} novanet-infrastructure`;
  const identity={resourceId:resource.id,fingerprint:bootstrap.fingerprint,address,operationId:operation.id};
  const checkpoint=await store.readState('lightnode-ssh');
  if(checkpoint.value && !Object.entries(identity).every(([key,value])=>checkpoint.value[key]===value))fail('NODE_CONFIGURATION_CHANGED');
  const sessions=[];
  async function authorize(){await renewLease(operation);await assertOperationAuthority(context,operation);await assertResourceOwnership({context,resource,operation});}
  async function open(password){
    await authorize();
    const session=await sessionFactory({host:address,expectedHostKey:bootstrap.fingerprint,...(password?{password}:{privateKey})});
    sessions.push(session);return session;
  }
  async function run(session,command){await authorize();return session.exec(command);}
  try {
    let session;
    try{session=await open();}
    catch(error){
      if(['STALE_FENCE','RESOURCE_SCOPE_MISMATCH','PROTECTED_RESOURCE'].includes(error.code))throw error;
      const passwordSession=await open(bootstrap.password);
      await run(passwordSession,`set -eu; install -d -m 700 /root/.ssh; touch /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; grep -Fqx '${publicLine}' /root/.ssh/authorized_keys || printf '%s\\n' '${publicLine}' >> /root/.ssh/authorized_keys`);
      session=await open();
    }
    await run(session,"set -eu; install -d -m 755 /etc/ssh/sshd_config.d; printf '%s\\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PubkeyAuthentication yes' 'PermitRootLogin prohibit-password' > /etc/ssh/sshd_config.d/00-novanet-infrastructure.conf; chmod 644 /etc/ssh/sshd_config.d/00-novanet-infrastructure.conf; /usr/sbin/sshd -t; passwd -l root >/dev/null; systemctl reload ssh");
    const policy=await run(session,'/usr/sbin/sshd -T');
    if(!['passwordauthentication no','kbdinteractiveauthentication no','pubkeyauthentication yes'].every(line=>policy.split(/\r?\n/).includes(line))||
      !policy.split(/\r?\n/).some(line=>/^permitrootlogin (prohibit-password|without-password)$/.test(line)))fail('NODE_SSH_HARDENING_UNVERIFIED');
    await authorize();
    await store.saveState('lightnode-ssh',{...identity,completed:true,assurance:'operator_enabled_tofu_then_pinned'},checkpoint.version);
    return {fingerprint:bootstrap.fingerprint,keyAuthenticationVerified:true,passwordAuthenticationDisabled:true};
  } catch(error) {
    const allowed=['STALE_FENCE','LEASE_EXPIRED','RESOURCE_SCOPE_MISMATCH','PROTECTED_RESOURCE','NODE_CONFIGURATION_CHANGED','NODE_SSH_HARDENING_UNVERIFIED'];
    fail(allowed.includes(error.code)?error.code:'NODE_BOOTSTRAP_PENDING');
  } finally {for(const session of sessions){try{await session.close();}catch{/* bounded session cleanup */}}}
}
