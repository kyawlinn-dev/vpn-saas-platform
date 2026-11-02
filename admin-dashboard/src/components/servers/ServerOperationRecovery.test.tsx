import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ServerOperationDialog } from './ServerOperationDialog';
import { ServerOperationProgress } from './ServerOperationProgress';
import { serverOperationsApi, type ServerOperation } from '@/features/serverOperations/api';

vi.mock('@/features/serverOperations/api', () => ({ serverOperationsApi: { catalog: vi.fn(), quote: vi.fn(), create: vi.fn(), get: vi.fn(), control: vi.fn() } }));
const storageKey = 'novanet:pending-server-operation';
const request = { quote_id: 'quote', confirm_cost: true, confirm_temporary_billing: false, confirm_delete_source: false };
const pending = { key: 'original-key', request, quote: { id: 'quote', kind: 'add', expiresAt: '2000-01-01', price: null }, choice: { kind: 'add', provider: 'digitalocean', region: 'ams3', plan_id: 'compute', supported_protocols: ['vless'] } };
const readiness = [{ id: 'digitalocean' as const, ready: true, reason: null, profiles: ['vless_only' as const] }, { id: 'vultr' as const, ready: true, reason: null, profiles: ['vless_only' as const] }];
const metadata = { observed_at: null, stale: false };
const plan = { id: 'compute', label: 'Compute', cpu: 1, memory_mb: 1024, disk_gb: 25, transfer: { included: null, unit: null }, price: { monthly: 6, hourly: null, currency: 'USD' }, available: true, compatible: true, reason: null, architecture: null, family: null };
const operation: ServerOperation = { id: 'operation', kind: 'add', status: 'blocked', phase: 'verifying', source_server_id: null, destination_server_id: null, counts: { total: 1, verified: 0 }, price: null, created_at: null, updated_at: null, error_code: null, ongoing_charges: [], allowed_actions: ['resume'] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function open() {
  return render(<ServerOperationDialog mode="add" servers={[]} providerReadiness={readiness} onClose={() => {}} onCreated={vi.fn()} />);
}
beforeEach(() => {
  sessionStorage.setItem(storageKey, JSON.stringify(pending));
  vi.mocked(serverOperationsApi.catalog).mockImplementation(async ({ provider, region }) => region
    ? { provider, region, plans: [plan], ...metadata }
    : { provider, regions: [{ id: 'ams3', label: 'Amsterdam', available: true }], ...metadata });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); sessionStorage.clear(); });

it.each([400, 403, 404])('retains an uncertain creation after generic %s and replays the original key/body', async status => {
  vi.mocked(serverOperationsApi.create).mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce({ response: { status } }).mockResolvedValue(operation);
  const first = open();
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
  await screen.findByRole('alert');
  first.unmount();
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
  await waitFor(() => expect(serverOperationsApi.create).toHaveBeenCalledTimes(2));
  expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual(pending);
  expect(screen.getByText('Submission awaiting confirmation')).toBeTruthy();
  expect((screen.getByLabelText('Provider') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
  await waitFor(() => expect(serverOperationsApi.create).toHaveBeenCalledTimes(3));
  expect(vi.mocked(serverOperationsApi.create).mock.calls).toEqual([[request, 'original-key'], [request, 'original-key'], [request, 'original-key']]);
  await waitFor(() => expect(sessionStorage.getItem(storageKey)).toBeNull());
});

it('restores both regions and plans after authoritative rejection of a recovered quote', async () => {
  vi.mocked(serverOperationsApi.create).mockRejectedValue({ response: { status: 409, data: { code: 'QUOTE_EXPIRED' } } });
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
  await screen.findByRole('option', { name: 'Compute' });
  expect((screen.getByLabelText('Region') as HTMLSelectElement).disabled).toBe(false);
  expect(screen.getByRole('option', { name: 'Amsterdam' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Review Quote' }) as HTMLButtonElement).disabled).toBe(false);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
});

it('ignores recovered catalogue results after changing providers', async () => {
  const old = deferred<Awaited<ReturnType<typeof serverOperationsApi.catalog>>>();
  vi.mocked(serverOperationsApi.create).mockRejectedValue({ response: { status: 409, data: { code: 'QUOTE_EXPIRED' } } });
  vi.mocked(serverOperationsApi.catalog).mockImplementationOnce(() => old.promise);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'vultr' } });
  await screen.findByRole('option', { name: 'Amsterdam' });
  await act(async () => old.resolve({ provider: 'digitalocean', regions: [{ id: 'old', label: 'Obsolete region', available: true }], ...metadata }));
  expect(screen.queryByRole('option', { name: 'Obsolete region' })).toBeNull();
});

it('keeps completed GET status when an older Resume response arrives late', async () => {
  vi.useFakeTimers();
  const get = deferred<ServerOperation>();
  const resume = deferred<ServerOperation>();
  const onComplete = vi.fn();
  vi.mocked(serverOperationsApi.get).mockReturnValue(get.promise);
  vi.mocked(serverOperationsApi.control).mockReturnValue(resume.promise);
  render(<ServerOperationProgress initial={operation} onComplete={onComplete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await act(async () => get.resolve({ ...operation, status: 'completed', allowed_actions: [] }));
  await act(async () => resume.resolve({ ...operation, status: 'queued', allowed_actions: [] }));
  expect(screen.getByText('completed / verifying')).toBeTruthy();
  expect(onComplete).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(serverOperationsApi.get).toHaveBeenCalledTimes(1);
});

it.each(['completed', 'running'])('accepts same-ID parent %s updates and ignores older in-flight responses', async status => {
  const get = deferred<ServerOperation>();
  const resume = deferred<ServerOperation>();
  vi.mocked(serverOperationsApi.get).mockReturnValue(new Promise(() => {})).mockReturnValueOnce(get.promise);
  vi.mocked(serverOperationsApi.control).mockReturnValue(resume.promise);
  const view = render(<ServerOperationProgress initial={operation} />);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  view.rerender(<ServerOperationProgress initial={{ ...operation, status, allowed_actions: [] }} />);
  expect(screen.getByText(`${status} / verifying`)).toBeTruthy();
  await act(async () => get.resolve(operation));
  await act(async () => resume.resolve({ ...operation, status: 'queued' }));
  expect(screen.getByText(`${status} / verifying`)).toBeTruthy();
});

it('continues polling after a newer running GET supersedes a late Resume response', async () => {
  vi.useFakeTimers();
  const get = deferred<ServerOperation>();
  const resume = deferred<ServerOperation>();
  const onComplete = vi.fn();
  vi.mocked(serverOperationsApi.get).mockReturnValueOnce(get.promise).mockResolvedValue({ ...operation, status: 'completed', allowed_actions: [] });
  vi.mocked(serverOperationsApi.control).mockReturnValue(resume.promise);
  render(<ServerOperationProgress initial={operation} onComplete={onComplete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await act(async () => get.resolve({ ...operation, status: 'running', allowed_actions: [] }));
  await act(async () => resume.resolve({ ...operation, status: 'queued', allowed_actions: [] }));
  expect(screen.getByText('running / verifying')).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(screen.getByText('completed / verifying')).toBeTruthy();
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('does not regress completed detail state to an older same-ID parent snapshot', async () => {
  const get = deferred<ServerOperation>();
  const onComplete = vi.fn();
  vi.mocked(serverOperationsApi.get).mockReturnValueOnce(get.promise).mockReturnValue(new Promise(() => {}));
  const view = render(<ServerOperationProgress initial={operation} onComplete={onComplete} />);
  await act(async () => get.resolve({ ...operation, status: 'completed', updated_at: '2026-10-28T09:00:02Z', allowed_actions: [] }));
  view.rerender(<ServerOperationProgress initial={{ ...operation, status: 'running', updated_at: '2026-10-28T09:00:01Z', allowed_actions: ['cancel'] }} onComplete={onComplete} />);
  expect(screen.getByText('completed / verifying')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('refreshes inventory once when completion arrives through parent props before the detail GET', async () => {
  const get = deferred<ServerOperation>();
  const onComplete = vi.fn();
  vi.mocked(serverOperationsApi.get).mockReturnValue(get.promise);
  const view = render(<ServerOperationProgress initial={operation} onComplete={onComplete} />);
  const completed = { ...operation, status: 'completed', allowed_actions: [] };
  view.rerender(<ServerOperationProgress initial={completed} onComplete={onComplete} />);
  expect(onComplete).toHaveBeenCalledTimes(1);
  view.rerender(<ServerOperationProgress initial={{ ...completed }} onComplete={onComplete} />);
  await act(async () => get.resolve(operation));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(screen.getByText('completed / verifying')).toBeTruthy();
});

it('keeps control-delivered cancellation when an older GET resolves afterwards', async () => {
  vi.useFakeTimers();
  const get = deferred<ServerOperation>();
  const onComplete = vi.fn();
  vi.mocked(serverOperationsApi.get).mockReturnValue(get.promise);
  vi.mocked(serverOperationsApi.control).mockResolvedValue({ ...operation, status: 'cancelled', allowed_actions: [] });
  render(<ServerOperationProgress initial={operation} onComplete={onComplete} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resume' })));
  expect(screen.getByText('cancelled / verifying')).toBeTruthy();
  await act(async () => get.resolve(operation));
  expect(screen.getByText('cancelled / verifying')).toBeTruthy();
  expect(onComplete).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(serverOperationsApi.get).toHaveBeenCalledTimes(1);
});
