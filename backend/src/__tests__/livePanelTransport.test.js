import { describe, expect, it, vi } from 'vitest';
import { connectPanelTransport } from '../services/infrastructure/livePanelTransport.js';
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });
describe('live panel transport (injected HTTP)', () => {
  it('authenticates at the configured panel and never retries an uncertain mutation', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply({ access_token: 'fixture-token' })).mockRejectedValueOnce(new Error('fixture-password'));
    const panel = await connectPanelTransport({ baseUrl: 'https://panel.example.invalid', username: 'fixture', password: 'fixture-password', fetchImpl });
    await expect(panel.request({ method: 'POST', path: '/api/nodes', body: { name: 'fixture' } })).rejects.toMatchObject({ code: 'PANEL_REQUEST_UNCERTAIN', message: 'PANEL_REQUEST_UNCERTAIN' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer fixture-token');
    expect(fetchImpl.mock.calls[1][1].redirect).toBe('error');
  });
  it('rejects remote plain HTTP and escaped paths without transmitting credentials', async () => {
    const fetchImpl = vi.fn();
    await expect(connectPanelTransport({ baseUrl: 'http://panel.example.invalid', username: 'fixture', password: 'fixture', fetchImpl })).rejects.toMatchObject({ code: 'PANEL_CONFIGURATION_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
    fetchImpl.mockResolvedValue(reply({ access_token: 'fixture' }));
    const panel = await connectPanelTransport({ baseUrl: 'https://panel.example.invalid', username: 'fixture', password: 'fixture', fetchImpl });
    await expect(panel.request({ path: '/api/../admins' })).rejects.toMatchObject({ code: 'INVALID_PANEL_REQUEST' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('lists all pages and rejects repeated or incomplete inventory', async () => {
    const fetchImpl = vi.fn(async (url) => String(url).includes('/token') ? reply({ access_token: 'fixture' })
      : String(url).includes('page=2') ? reply({ items: [{ id: 2 }], pages: 2 }) : reply({ items: [{ id: 1 }], pages: 2 }));
    const panel = await connectPanelTransport({ baseUrl: 'https://panel.example.invalid', username: 'fixture', password: 'fixture', fetchImpl });
    expect(await panel.list('/api/nodes')).toEqual([{ id: 1 }, { id: 2 }]);
    fetchImpl.mockImplementation(async () => reply({ items: [{ id: 1 }], pages: 2 }));
    await expect(panel.list('/api/nodes')).rejects.toMatchObject({ code: 'PANEL_INVENTORY_INCOMPLETE' });
  });
});
