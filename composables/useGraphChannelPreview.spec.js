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
