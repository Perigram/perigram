import { describe, expect, it, vi } from 'vitest';
import { createAbortableCapabilityCaller } from './plugin-runtime.js';

describe('managed plugin capability cancellation', () => {
  it('rejects a capability call made after its invocation was aborted', async () => {
    const controller = new AbortController();
    controller.abort('cancelled');
    const pending = new Map();
    const send = vi.fn();
    const call = createAbortableCapabilityCaller({
      signal: controller.signal,
      nextCallId: () => 'cap-1',
      pending,
      send
    });

    await expect(call('files.read', { fileId: 'file-1' })).rejects.toMatchObject({
      name: 'AbortError',
      code: 'PLUGIN_EXECUTION_ABORTED'
    });
    expect(send).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
  });

  it('rejects and removes an in-flight capability call when its invocation aborts', async () => {
    const controller = new AbortController();
    const pending = new Map();
    const send = vi.fn();
    const call = createAbortableCapabilityCaller({
      signal: controller.signal,
      nextCallId: () => 'cap-1',
      pending,
      send
    });

    const result = call('files.read', { fileId: 'file-1' });
    expect(pending.size).toBe(1);
    controller.abort('cancelled');

    await expect(result).rejects.toMatchObject({
      name: 'AbortError',
      code: 'PLUGIN_EXECUTION_ABORTED'
    });
    expect(pending.size).toBe(0);
  });

  it('settles normally and removes the pending entry after a host response', async () => {
    const controller = new AbortController();
    const pending = new Map();
    const call = createAbortableCapabilityCaller({
      signal: controller.signal,
      nextCallId: () => 'cap-1',
      pending,
      send: vi.fn()
    });

    const result = call('files.read', { fileId: 'file-1' });
    pending.get('cap-1').resolve({ text: 'ok' });
    await expect(result).resolves.toEqual({ text: 'ok' });
    expect(pending.size).toBe(0);
  });
});
