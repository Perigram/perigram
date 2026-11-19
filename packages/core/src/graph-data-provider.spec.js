import { describe, expect, it, vi } from 'vitest';
import { createCoreGraphDataProvider, CORE_DATA_PROVIDER } from './graph-data-provider.js';

describe('core graph data provider', () => {
  it('forwards exact-instance selection to the authorized host query capability', async () => {
    const queryInstances = vi.fn(async query => ({ items: [{ _id: query.instanceId }], count: 1 }));
    const provider = createCoreGraphDataProvider();
    const definition = provider.definitions[0];
    const result = await provider.execute(definition, {
      config: { typeId: 'part', instanceId: 'part-1' },
      context: { data: { queryInstances } }
    });
    expect(definition).toMatchObject({
      provider: CORE_DATA_PROVIDER,
      id: 'query.instances',
      configuration: { properties: { instanceId: { type: 'string', maxLength: 256 } } }
    });
    expect(queryInstances).toHaveBeenCalledWith({
      typeId: 'part',
      instanceId: 'part-1',
      filters: {}
    });
    expect(result).toEqual({ items: [{ _id: 'part-1' }], count: 1 });
  });
});
