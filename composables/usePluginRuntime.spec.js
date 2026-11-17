import { describe, expect, it, vi } from 'vitest';
import { usePluginRuntime } from './usePluginRuntime.js';
import { createRuntime as createDocumentsRuntime } from '../workers/documents/runtime/shared.mjs';

class FakeWorker {
  constructor(providers = []) {
    this.providers = providers;
    this.messages = [];
    this.terminated = false;
  }

  postMessage(message) {
    this.messages.push(message);
    if (message.type === 'initialize') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready', providers: this.providers } }));
    }
    if (message.type === 'invoke') {
      queueMicrotask(() => this.onmessage?.({
        data: { type: 'result', invocationId: message.invocationId, value: { operationId: message.operationId, input: message.input } }
      }));
    }
    if (message.type === 'clear-execution') {
      queueMicrotask(() => this.onmessage?.({
        data: { type: 'result', invocationId: message.invocationId, value: true }
      }));
    }
  }

  terminate() {
    this.terminated = true;
  }
}

const binding = { organizationId: 'org-1', pluginId: 'demo', version: '3' };
const runtime = { id: 'javascript', version: '1', entryUrl: '/api/plugins/demo/module/runtime.mjs', targets: ['browser'] };
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

  it('loads provider declarations and routes provider execution through Worker RPC', async () => {
    const worker = new FakeWorker([{
      provider: 'plugin.demo',
      definitions: [{
        provider: 'plugin.demo', id: 'math.double', version: '1', inputs: [], outputs: [],
        execution: { kind: 'pure', runtime: 'javascript', targets: ['browser'] }
      }]
    }]);
    const invokeCapability = vi.fn(async ({ name, input }) => ({ name, input }));
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker, invokeCapability });
    const [provider] = await pluginRuntime.loadProviders(binding, runtime);
    expect(provider.provider).toBe('plugin.demo');
    await expect(provider.execute({ id: 'math.double', execution }, { input: 2 }))
      .resolves.toEqual({ operationId: 'math.double', input: { input: 2 } });
  });

  it('loads the installed Documents listing-derived provider and dispatches a graph invocation', async () => {
    const documents = createDocumentsRuntime();
    const worker = new FakeWorker(documents.providers);
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker });
    const documentsBinding = { organizationId: 'org-1', pluginId: 'documents', version: '23' };
    const documentsRuntime = {
      id: 'documents-shared',
      version: '1',
      entryUrl: '/api/plugins/documents/module/runtime/shared.mjs',
      targets: ['browser']
    };
    const [provider] = await pluginRuntime.loadProviders(documentsBinding, documentsRuntime);
    expect(provider.provider).toBe('plugin.documents');
    expect(provider.definitions.map(definition => definition.id)).toContain('document-paragraph');
    expect(provider.definitions.find(definition => definition.id === 'read-table-rows')?.execution.capabilities).toEqual(['files.read']);
    const paragraph = provider.definitions.find(definition => definition.id === 'document-paragraph');
    await provider.execute(paragraph, {
      node: { id: 'paragraph-1' },
      config: {},
      inputs: { text: 'Hello from the graph' },
      mode: 'preview'
    });
    expect(worker.messages.find(message => message.type === 'invoke')).toMatchObject({
      operationId: 'document-paragraph',
      input: { inputs: { text: 'Hello from the graph' }, mode: 'preview' }
    });
    pluginRuntime.dispose();
  });

  it('finalizes execution-scoped native values across loaded runtimes', async () => {
    const worker = new FakeWorker();
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker });
    await pluginRuntime.execute(binding, runtime, 'transform', { value: 1 }, { execution });
    await expect(pluginRuntime.finalizeExecution('preview-run-1')).resolves.toEqual([true]);
    expect(worker.messages.find(message => message.type === 'clear-execution')).toMatchObject({
      executionId: 'preview-run-1'
    });
    pluginRuntime.dispose();
  });

  it('strips host-only graph read-set recorders before worker dispatch', async () => {
    const worker = new FakeWorker();
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker });
    const invocation = {
      node: { id: 'node-1' },
      config: { graphId: 'graph-1' },
      inputs: { width: 2 },
      context: {
        graphId: 'graph-1',
        executionId: 'run-1',
        readSet: { recordInstance() {}, toJSON() { return {}; } }
      },
      mode: 'preview'
    };
    await pluginRuntime.execute(binding, runtime, 'transform', invocation, { execution });
    const message = worker.messages.find(item => item.type === 'invoke');
    expect(message.input.context).toEqual({
      graphId: 'graph-1',
      executionId: 'run-1'
    });
    expect(message.input.node).toEqual(invocation.node);
    expect(message.input.inputs).toEqual(invocation.inputs);
  });

  it('resolves worker renderer ids to installed preview surface modules', async () => {
    const surface = {
      id: 'mesh-preview',
      url: '/api/plugins/demo/module/preview/mesh.mjs',
      surfaceContract: 1
    };
    const worker = new FakeWorker([{
      provider: 'plugin.demo',
      definitions: [{
        provider: 'plugin.demo', id: 'geometry.mesh', version: '1', inputs: [], outputs: [],
        execution: { kind: 'pure', runtime: 'javascript', targets: ['browser'] },
        preview: { renderer: 'mesh' }
      }],
      previewRenderers: { mesh: 'mesh-preview' }
    }]);
    const pluginRuntime = usePluginRuntime({ createWorker: () => worker });
    const [provider] = await pluginRuntime.loadProviders({
      ...binding,
      previewRenderers: [surface]
    }, runtime);
    expect(provider.previewRenderers.mesh).toEqual(surface);
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
