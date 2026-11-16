import { describe, expect, it, vi } from 'vitest';
import { usePluginRuntime } from './usePluginRuntime.js';

class FakeWorker {
  constructor() {
    this.messages = [];
    this.terminated = false;
  }

  postMessage(message) {
    this.messages.push(message);
    if (message.type === 'initialize') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
    }
    if (message.type === 'invoke') {
      queueMicrotask(() => this.onmessage?.({
        data: { type: 'result', invocationId: message.invocationId, value: { operationId: message.operationId, input: message.input } }
      }));
    }
  }

  terminate() {
    this.terminated = true;
  }
}

const binding = { organizationId: 'org-1', pluginId: 'demo', version: '3' };
const runtime = { id: 'javascript', version: '1', entryUrl: '/api/plugins/demo/module/runtime.mjs' };
const execution = { targets: ['browser'], capabilities: [] };

describe('usePluginRuntime', () => {
  it('loads one worker per pinned package runtime and dispatches operations', async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker);
    const pluginRuntime = usePluginRuntime({ createWorker });
    await expect(pluginRuntime.execute(binding, runtime, 'transform', { value: 2 }, { execution }))
      .resolves.toEqual({ operationId: 'transform', input: { value: 2 } });
    await pluginRuntime.execute(binding, runtime, 'transform', { value: 3 }, { execution });
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.messages.filter(message => message.type === 'invoke')).toHaveLength(2);
    pluginRuntime.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('refuses operations without browser support', async () => {
    const pluginRuntime = usePluginRuntime({ createWorker: () => new FakeWorker() });
    await expect(pluginRuntime.execute(binding, runtime, 'server-only', {}, {
      execution: { targets: ['server'] }
    })).rejects.toThrow(/does not support browser execution/);
  });

  it('mediates declared host capabilities through the main thread', async () => {
    class CapabilityWorker extends FakeWorker {
      postMessage(message) {
        this.messages.push(message);
        if (message.type === 'initialize') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
        if (message.type === 'invoke') queueMicrotask(() => this.onmessage?.({
          data: { type: 'capability-request', callId: 'cap-1', invocationId: message.invocationId, name: 'files.read', input: { fileId: 'f1' } }
        }));
        if (message.type === 'capability-result') queueMicrotask(() => this.onmessage?.({
          data: { type: 'result', invocationId: this.messages.find(item => item.type === 'invoke').invocationId, value: message.value }
        }));
      }
    }
    const worker = new CapabilityWorker();
    const readFile = vi.fn(async input => ({ text: input.fileId }));
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker });
    await expect(pluginRuntime.execute(binding, runtime, 'read', {}, {
      execution: { targets: ['browser'], capabilities: ['files.read'] },
      capabilities: { 'files.read': readFile }
    })).resolves.toEqual({ text: 'f1' });
    expect(readFile).toHaveBeenCalledWith({ fileId: 'f1' }, expect.objectContaining({ operationId: 'read' }));
  });

  it('rejects undeclared capability calls', async () => {
    class CapabilityWorker extends FakeWorker {
      postMessage(message) {
        this.messages.push(message);
        if (message.type === 'initialize') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
        if (message.type === 'invoke') queueMicrotask(() => this.onmessage?.({
          data: { type: 'capability-request', callId: 'cap-1', invocationId: message.invocationId, name: 'files.read', input: {} }
        }));
        if (message.type === 'capability-result') queueMicrotask(() => this.onmessage?.({
          data: { type: 'result-error', invocationId: this.messages.find(item => item.type === 'invoke').invocationId, error: message.error }
        }));
      }
    }
    const worker = new CapabilityWorker();
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker });
    await expect(pluginRuntime.execute(binding, runtime, 'read', {}, {
      execution: { targets: ['browser'], capabilities: [] },
      capabilities: { 'files.read': async () => ({}) }
    })).rejects.toThrow(/not declared/);
  });
});
