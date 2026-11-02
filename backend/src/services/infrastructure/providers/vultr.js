import { createProviderAdapter } from "./providerCore.js";

// Official SDK wire contracts (reviewed 2026-10-21):
// https://github.com/vultr/govultr/blob/master/instance.go
// Catalog/account adapters must separately prove pricing, availability and identity.
export function createVultrProvider(input) {
  return createProviderAdapter({ ...input, descriptor: {
    provider: "vultr", path: "/v2/instances", singular: "instance", plural: "instances",
    normalize: raw => ({ id: String(raw?.id ?? ""), createdAt: raw?.date_created,
      region: raw?.region, planId: raw?.plan, tags: raw?.tags || [], status: raw?.status,
      powerStatus: raw?.power_status, serverStatus: raw?.server_status,
      addresses: [raw?.main_ip, raw?.v6_main_ip].filter(ip => ip && ip !== '0.0.0.0' && ip !== '::') }),
    isReady: resource => resource.status === 'active' && resource.powerStatus === 'running' && resource.serverStatus === 'ok' &&
      resource.addresses.some(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)),
    createBody: ({ quote, machine, tags, name }) => ({ label: name, hostname: name,
      region: quote.region, plan: quote.planId, os_id: machine.osId,
      sshkey_id: [...machine.sshKeyIds], firewall_group_id: machine.firewallId,
      tags, backups: "disabled", enable_ipv6: true, activation_email: false,
      ...(machine.userData ? { user_data: Buffer.from(machine.userData).toString('base64') } : {}) }),
    nextQuery: data => data.meta?.links?.next ? { cursor: data.meta.links.next, per_page: 200 } : null,
  } });
}
