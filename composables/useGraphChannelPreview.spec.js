import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useGraphChannelPreview } from './useGraphChannelPreview.js';

const definition = () => ({
  graph: { nodes: [{ id: 'a', data: { refId: 'r1' } }, { id: 'b', data: { refId: 'r2' } }] },
  processNodes: { r1: {}, r2: { previewVisible: false } }
});

function evaluation() {
  return {
    nodes: {
      a: { outputs: { value: 1 } },
      b: { outputs: { value: 2 }, error: 'boom' }
    }
  };
}

function composable(previewDraft) {
  return useGraphChannelPreview({
    persistence: { previewDraft },
    serializeProcess: definition
  });
}

describe('client-side evaluation (SPEC §20 client-carried engines)', () => {
  const engineBinding = {
    pluginId: 'demo',
    version: '1',
    url: '/api/plugins/demo/module/engine/index.mjs',
    services: ['plugin.demo.echo']
  };
  const domain = () => ({
    serviceContracts: {
      'plugin.demo.echo': {
        signature: { input: { base: 'record', fields: { text: { base: 'string' } } }, output: { base: 'string' } }
      }
    }
  });

  function localDefinition(records, edges) {
    return {
      id: 'd',
      dataflowVersion: 4,
      processNodes: Object.fromEntries(records.map(record => [record.id, record])),
      graph: {
        nodes: records.map(record => ({ id: record.id, type: 'processNode', data: { refId: record.id } })),
        edges
      }
    };
  }

  const echoGraph = () => localDefinition(
    [
      { id: 'text', kind: 'source.literalItem', value: 'ping' },
      { id: 'echo', kind: 'cts.service', operator: 'plugin.demo.echo' }
    ],
    [{ id: 'e1', source: 'text', sourceHandle: 'data:value', target: 'echo', targetHandle: 'data:text', role: 'data' }]
  );

  function channel({ graph = echoGraph(), engines = [engineBinding], runtimes = [], previewDraft, loadModule, createPluginRuntime }) {
    return useGraphChannelPreview({
      persistence: { previewDraft },
      serializeProcess: () => graph,
      clientEngines: () => ({ engines, domain: domain() }),
      clientRuntimes: () => runtimes,
      ...(loadModule ? { loadModule } : {}),
      ...(createPluginRuntime ? { createPluginRuntime } : {})
    });
  }

  it('evaluates a local-service graph in the browser through the engine', async () => {
    const previewDraft = vi.fn();
    const result = channel({
      previewDraft,
      loadModule: async () => ({ default: () => ({ dispatch: async (serviceId, parameters) => `${serviceId}:${parameters.text}` }) })
    });
    await result.run();
    expect(previewDraft).not.toHaveBeenCalled();
    expect(result.error.value).toBe('');
    expect(result.payload.value.nodes.echo.outputs.result.branches[0].items).toEqual(['echo:ping']);
  });

  it('evaluates a managed browser runtime service in the browser without server preview', async () => {
    const previewDraft = vi.fn();
    const binding = {
      organizationId: 'org-1',
      pluginId: 'demo',
      version: '4',
      runtime: { id: 'shared', entryUrl: '/runtime.mjs', targets: ['browser', 'server'] },
      services: [{
        id: 'echo',
        execution: { runtime: 'shared', kind: 'pure', targets: ['browser'], capabilities: [] }
      }]
    };
    const execute = vi.fn(async (_binding, _runtime, _operation, input) => ({ value: `runtime:${input.inputs.text}` }));
    const result = channel({
      engines: [],
      runtimes: [binding],
      previewDraft,
      createPluginRuntime: () => ({ execute, dispose: vi.fn() })
    });
    await result.run();
    expect(previewDraft).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      binding,
      binding.runtime,
      'echo',
      { mode: 'preview', inputs: { text: 'ping' } },
      expect.objectContaining({ execution: binding.services[0].execution })
    );
    expect(result.error.value).toBe('');
    expect(result.payload.value.nodes.echo.outputs.result.branches[0].items).toEqual(['runtime:ping']);
  });

  it('folds an engine dispatch failure into the node error', async () => {
    const result = channel({
      loadModule: async () => ({ default: () => ({ dispatch: async () => { throw new Error('engine exploded'); } }) })
    });
    await result.run();
    expect(result.error.value).toBe('');
    expect(result.payload.value.nodes.echo.error).toContain('engine exploded');
  });

  it('keeps the server evaluation outside the client gate', async () => {
    const previewDraft = vi.fn(async () => evaluation());
    const withConstruct = localDefinition(
      [
        { id: 'text', kind: 'source.literalItem', value: 'ping' },
        { id: 'echo', kind: 'cts.service', operator: 'plugin.demo.echo' },
        { id: 'make', kind: 'cts.construct', typeId: 'widget' }
      ],
      []
    );
    await channel({ graph: withConstruct, previewDraft }).run();
    await channel({ graph: echoGraph(), engines: [], previewDraft }).run();
    await channel({
      graph: localDefinition([{ id: 'text', kind: 'source.literalItem', value: 'x' }], []),
      previewDraft
    }).run();
    expect(previewDraft).toHaveBeenCalledTimes(3);
  });
});

describe('useGraphChannelPreview', () => {
  it('runs the whole-graph evaluation and filters hidden node outputs', async () => {
    const preview = vi.fn(async () => evaluation());
    const channel = composable(preview);
    await channel.run();
    expect(preview).toHaveBeenCalledWith(definition(), undefined);
    expect(channel.running.value).toBe(false);
    expect(channel.error.value).toBe('');
    expect(channel.payload.value.nodes.a).toEqual({ outputs: { value: 1 } });
    // A hidden node keeps its error alone (SPEC §28 preview visibility).
    expect(channel.payload.value.nodes.b).toEqual({ outputs: {}, error: 'boom' });
  });

  it('carries the evaluation failure as state', async () => {
    const channel = composable(async () => {
      throw Object.assign(new Error('nope'), { data: { message: 'served refusal' } });
    });
    await channel.run();
    expect(channel.error.value).toBe('served refusal');
    expect(channel.payload.value).toBe(null);
  });

  it('schedules one debounced run while active and cancels when idle', async () => {
    vi.useFakeTimers();
    try {
      const preview = vi.fn(async () => evaluation());
      const channel = composable(preview);
      channel.schedule(true, { debounceMs: 50 });
      channel.schedule(true, { debounceMs: 50 });
      expect(preview).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60);
      await nextTick();
      expect(preview).toHaveBeenCalledTimes(1);
      channel.schedule(false);
      await vi.advanceTimersByTimeAsync(60);
      expect(preview).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});


describe('preview evaluation lifecycle', () => {
  it('does not let an older in-flight evaluation overwrite a newer preview', async () => {
    const pending = [];
    const preview = vi.fn(() => new Promise(resolve => pending.push(resolve)));
    const channel = composable(preview);

    const first = channel.run();
    const second = channel.run();
    pending[1](evaluation());
    await second;
    expect(channel.payload.value.nodes.a.outputs.value).toBe(1);

    const stale = { nodes: { a: { outputs: { value: 'stale' } } } };
    pending[0](stale);
    await first;
    expect(channel.payload.value.nodes.a.outputs.value).toBe(1);
    expect(channel.running.value).toBe(false);
  });

  it('invalidates an in-flight evaluation as soon as a newer active preview is scheduled', async () => {
    vi.useFakeTimers();
    try {
      let resolvePreview;
      const channel = composable(() => new Promise(resolve => { resolvePreview = resolve; }));
      const running = channel.run();
      channel.schedule(true, { debounceMs: 100 });
      resolvePreview(evaluation());
      await running;
      expect(channel.payload.value).toBe(null);
      expect(channel.running.value).toBe(false);
      channel.schedule(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates an in-flight evaluation when the preview tab becomes inactive', async () => {
    let resolvePreview;
    const channel = composable(() => new Promise(resolve => { resolvePreview = resolve; }));
    const running = channel.run();
    expect(channel.running.value).toBe(true);

    channel.schedule(false);
    resolvePreview(evaluation());
    await running;

    expect(channel.payload.value).toBe(null);
    expect(channel.running.value).toBe(false);
  });
});
