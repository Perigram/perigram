import { describe, expect, it, vi } from 'vitest';
import { collectTransferableBuffers, createAbortableCapabilityCaller } from './plugin-runtime.js';

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

describe('transferable geometry buffers', () => {
  const large = () => {
    const buffer = new ArrayBuffer(96 * 1024);
    new Float64Array(buffer).fill(1.5);
    return buffer;
  };

  it('collects nested typed-array buffers once per backing buffer', () => {
    const buffer = large();
    const value = { meshes: [{ positions: new Float64Array(buffer, 0, 8) }, { indices: new Uint32Array(buffer) }] };
    const indicesLength = new Uint32Array(buffer).length;
    const transfer = collectTransferableBuffers(value);
    expect(transfer).toEqual([buffer]);
    const clone = structuredClone(value, { transfer });
    expect(clone.meshes[0].positions[0]).toBe(1.5);
    expect(clone.meshes[1].indices.length).toBe(indicesLength);
    expect(buffer.byteLength).toBe(0);
  });

  it('keeps excluded received views and small or shared buffers on the clone path', () => {
    const received = large();
    const small = new Uint8Array(512).buffer;
    const owned = large();
    const value = { passthrough: new Float64Array(received), small: new Uint8Array(small), fresh: new Float64Array(owned) };
    const transfer = collectTransferableBuffers(value, { exclude: new Set([received]) });
    expect(transfer).toEqual([owned]);
    if (typeof SharedArrayBuffer !== 'undefined') {
      const shared = new SharedArrayBuffer(96 * 1024);
      expect(collectTransferableBuffers({ shared: new Uint8Array(shared) })).toEqual([]);
    }
    const clone = structuredClone(value, { transfer });
    expect(clone.passthrough[0]).toBe(1.5);
    expect(clone.small.length).toBe(512);
    expect(clone.fresh.byteLength).toBe(96 * 1024);
    expect(received.byteLength).toBe(96 * 1024);
    expect(small.byteLength).toBe(512);
    expect(owned.byteLength).toBe(0);
  });

  it('preserves view offsets into a transferred buffer', () => {
    const buffer = large();
    const view = new Float64Array(buffer, 8 * 1024, 4);
    view.fill(2.5);
    const clone = structuredClone({ view }, { transfer: collectTransferableBuffers({ view }) });
    expect(clone.view.byteOffset).toBe(8 * 1024);
    expect(clone.view[0]).toBe(2.5);
  });
});
