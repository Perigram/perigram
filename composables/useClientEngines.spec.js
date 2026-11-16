import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { engineBindingForService, useClientEngines } from './useClientEngines.js';

const binding = {
  pluginId: 'demo',
  version: '1',
  url: '/api/plugins/demo/module/engine/index.mjs',
  services: ['plugin.demo.spin']
};

describe('useClientEngines', () => {
  it('resolves the binding that carries a service id', () => {
    expect(engineBindingForService([binding], 'plugin.demo.spin')).toBe(binding);
    expect(engineBindingForService([binding], 'plugin.demo.other')).toBe(null);
    expect(engineBindingForService([], 'plugin.demo.spin')).toBe(null);
  });

  it('loads an engine once and dispatches plugin-qualified ids to it', async () => {
    const dispatch = vi.fn(async (serviceId, parameters) => ({ serviceId, parameters }));
    const loadModule = vi.fn(async () => ({ default: () => ({ dispatch }) }));
    const engines = useClientEngines({ engines: ref([binding]), loadModule });
    await expect(engines.dispatchService('plugin.demo.spin', { x: 1 })).resolves.toEqual({ serviceId: 'spin', parameters: { x: 1 } });
    await engines.dispatchService('plugin.demo.spin', { x: 2 });
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed load and records its error', async () => {
    const loadModule = vi.fn(async () => ({ default: null }));
    const engines = useClientEngines({ engines: ref([binding]), loadModule });
    await expect(engines.dispatchService('plugin.demo.spin', {})).rejects.toThrow(/createEngine/);
    expect(engines.errors.value.demo).toBeTruthy();
    loadModule.mockResolvedValue({ default: () => ({ dispatch: async () => 1 }) });
    await expect(engines.dispatchService('plugin.demo.spin', {})).resolves.toBe(1);
  });

  it('loads graph-only engines with node-provider contributions', async () => {
    const nodeProviders = [{ provider: 'plugin.demo', definitions: [{
      provider: 'plugin.demo', id: 'value.constant', version: '1', inputs: [], outputs: [], execution: { kind: 'pure' }
    }], execute: async () => ({ value: 1 }) }];
    const engines = useClientEngines({
      engines: ref([binding]),
      loadModule: async () => ({ default: () => ({ nodeProviders }) })
    });
    await expect(engines.engineFor(binding)).resolves.toMatchObject({ nodeProviders });
    await expect(engines.dispatchService('plugin.demo.spin', {})).rejects.toThrow(/does not provide service dispatch/);
  });

  it('refuses a dispatch with no served binding', async () => {
    const engines = useClientEngines({ engines: ref([]), loadModule: vi.fn() });
    await expect(engines.dispatchService('plugin.demo.spin', {})).rejects.toThrow(/no served client engine/);
  });
});
