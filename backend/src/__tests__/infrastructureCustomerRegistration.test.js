import { describe, expect, it, vi } from 'vitest';
import { withCustomerInfrastructureMutation, registerCreatedCustomerUser } from '../services/infrastructure/customerMutationGuard.js';

describe('customer creation ownership', () => {
  it('registers an actual created user under the held server guard without persisting its subscription key', async () => {
    const context = {environment:'development',poolId:'pool',databaseIdentity:'db',panelIdentity:'panel'};
    const client = {rpc:vi.fn(async () => ({data:true,error:null}))};
    await withCustomerInfrastructureMutation({context,client,serverIds:['server']}, async () => {
      await registerCreatedCustomerUser({server:{id:'server'}, created:{outline_key_id:'user',_marzneshin_meta:{subscription_key:'private-key'}}});
    });
    const call = client.rpc.mock.calls.find(([name]) => name === 'register_server_customer_user');
    expect(call[1]).toMatchObject({p_server_id:'server',p_username:'user',p_subscription_key_hash:expect.stringMatching(/^[a-f0-9]{64}$/)});
    expect(JSON.stringify(call)).not.toContain('private-key');
    expect(client.rpc.mock.calls.at(-1)[0]).toBe('finish_server_customer_mutation');
  });
  it('does not write infrastructure receipts when coordination is off', async () => {
    await expect(registerCreatedCustomerUser({server:{id:'server'},created:{outline_key_id:'user'}})).resolves.toBeUndefined();
  });
});
