import { describe, expect, it } from 'vitest';
import { migrateLegacyCassetteInstanceStatus, migrateLegacyQueue } from './migrate-queue-nesting-contracts.js';

describe('queue nesting contract migration', () => {
  it('moves queue settings without turning old spacing into tool kerf', async () => {
    const result = await migrateLegacyQueue({
      data: {
        nestingParams: { width: 2400, height: 1200, thickness: 3, spacing: 17, toolId: 'tool-1' },
        job: { items: [{ cassetteTemplateId: 'c1', quantity: 2, dimensions: { A: 10 } }] }
      }
    }, {
      defaultMachineId: 'machine-default',
      resolveDesignId: async id => id === 'c1' ? 'd1' : null
    });
    expect(result.queue.data).not.toHaveProperty('nestingParams');
    expect(result.queue.data.nestingSettings).toEqual({
      materialMode: 'VIRTUAL',
      machineId: 'machine-default',
      virtualWidth: 2400,
      virtualLength: 1200,
      virtualThickness: 3,
      warehouseId: null,
      inventoryItems: [],
      toolProfileId: 'tool-1',
      requestedArtifacts: []
    });
    expect(result.queue.data.nestingSettings).not.toHaveProperty('spacing');
    expect(result.queue.data.job.items).toEqual([{ type: 'STATIC', typeId: 'cassette_design', id: 'd1', quantity: 2, parameters: { A: 10 } }]);
  });

  it('refuses to rewrite a queue when a legacy source cannot be resolved', async () => {
    const queue = { data: { job: { items: [{ id: 'missing' }] } } };
    const result = await migrateLegacyQueue(queue, { resolveDesignId: async () => null });
    expect(result.changed).toBe(false);
    expect(result.unresolved).toEqual(['missing']);
    expect(result.queue).toBe(queue);
  });

  it('rejects fractional quantities instead of silently changing demand', async () => {
    const queue = {
      data: { job: { items: [{ typeId: 'cassette_design', id: 'design-1', quantity: 1.5 }] } }
    };
    const result = await migrateLegacyQueue(queue, { resolveDesignId: async () => 'design-1' });

    expect(result.changed).toBe(false);
    expect(result.unresolved).toEqual(['design-1 (invalid quantity 1.5)']);
    expect(result.queue).toBe(queue);
  });

  it('derives the replacement cassette-instance state from the workflow input', () => {
    const result = migrateLegacyCassetteInstanceStatus({ status: { state: 'NESTED' } }, {
      legacyStates: ['NESTED'],
      initialState: 'CUT'
    });
    expect(result.instance.status.state.primary).toBe('CUT');
  });
});
