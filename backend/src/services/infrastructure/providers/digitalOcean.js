import { createProviderAdapter } from "./providerCore.js";

// Wire mapping reviewed against official Droplets API on 2026-10-21:
// https://docs.digitalocean.com/products/droplets/reference/api/droplets/
export function createDigitalOceanProvider(input) {
  return createProviderAdapter({ ...input, descriptor: {
    provider: "digitalocean", path: "/v2/droplets", singular: "droplet", plural: "droplets",
    normalize: raw => ({ id: String(raw?.id ?? ""), createdAt: raw?.created_at,
      region: raw?.region?.slug, planId: raw?.size_slug, tags: raw?.tags || [], status: raw?.status,
      addresses: [...(raw?.networks?.v4 || []), ...(raw?.networks?.v6 || [])].filter(n => n.type === 'public').map(n => n.ip_address) }),
    isReady: resource => resource.status === 'active' && resource.addresses.some(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '0.0.0.0'),
    createBody: ({ quote, machine, tags, name }) => {
      if (!machine.image || !machine.firewallTag) throw new Error("MACHINE_CONFIGURATION_REQUIRED");
      return { name, region: quote.region, size: quote.planId,
        image: machine.image, ssh_keys: [...machine.sshKeyIds], tags: [...tags, machine.firewallTag], backups: false, monitoring: true,
        ...(machine.userData ? { user_data: machine.userData } : {}) };
    },
    nextQuery: data => {
      const next = data.links?.pages?.next;
      if (!next) return null;
      const url = new URL(next);
      if (url.origin !== "https://api.digitalocean.com" || url.pathname !== "/v2/droplets") throw new Error("PROVIDER_PAGINATION_INCOMPLETE");
      return Object.fromEntries(url.searchParams);
    },
  } });
}
