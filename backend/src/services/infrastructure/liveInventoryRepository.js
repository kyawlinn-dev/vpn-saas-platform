import { infrastructureError } from './repository.js';
const fail = () => { throw infrastructureError('INVENTORY_INCOMPLETE'); };
export function createLiveInventoryRepository({ client }) {
  async function all(build) {
    const rows = [];
    for (let page=0;page<1000;page++) {
      const {data,error} = await build().order('id',{ascending:true}).range(page*500,page*500+499);
      if (error || !Array.isArray(data)) fail();
      rows.push(...data);
      if (data.length<500) return rows;
    }
    fail();
  }
  const poolKeys = context => all(() => client.from('vpn_keys').select('*,vpn_servers!inner(environment,access_pool_id)')
    .eq('vpn_servers.environment',context.environment).eq('vpn_servers.access_pool_id',context.poolId));
  async function linked(table, keys, column) {
    const rows = [], bindings = new Map();
    for (const key of keys) {
      if (!key[column] || !key.reseller_id) fail();
      if (bindings.has(key[column]) && bindings.get(key[column]) !== key.reseller_id) fail();
      bindings.set(key[column],key.reseller_id);
    }
    // Every customer/order read includes its reseller binding, including admin inventory.
    for (const [id,reseller] of bindings) {
      const {data,error} = await client.from(table).select('*').eq('id',id).eq('reseller_id',reseller).maybeSingle();
      if (error) fail(); if (data) rows.push(data);
    }
    return rows;
  }
  return { async listInventoryPage({context,source,destination,kind,cursor}) {
    if (cursor) fail(); let items;
    if (kind === 'keys') items = await poolKeys(context);
    else if (kind === 'orders') items = await linked('vpn_orders',await poolKeys(context),'order_id');
    else if (kind === 'customers') items = await linked('vpn_customers',await poolKeys(context),'customer_id');
    else if (kind === 'assignments') items = await all(() => client.from('token_server_assignments').select('*').eq('server_id',source.id));
    else if (kind === 'destinationKeys') items = destination ? await all(() => client.from('vpn_keys').select('*').eq('server_id',destination.id)) : [];
    else if (kind === 'serverAliases') items = (await all(() => client.from('vpn_servers').select('id,provider_resource_id,droplet_id,host_ip,status,ownership_provenance').neq('status','decommissioned')))
      .map(row => ({...row,provider_resource_id:row.provider_resource_id || (row.droplet_id ? String(row.droplet_id) : null),addresses:row.ownership_provenance?.addresses || (row.host_ip ? [row.host_ip] : [])}));
    else fail();
    return {items,complete:true,nextCursor:null};
  }};
}
