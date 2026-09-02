import { describe, expect, it } from 'vitest';
import { migrateProducerOutputIdentities } from './migration-producer-identities.js';

function persistedCreate() {
  return {
    dataflowVersion: 4,
    graph: {
      nodes: [{ id: 'processNode_1785860422855', type: 'processNode', data: { refId: 'processNode_1785860422855' } }],
      edges: []
    },
    producerOutputs: {},
    actions: {},
    processNodes: {
      processNode_1785860422855: {
        id: 'processNode_1785860422855',
        kind: 'effect.createEntity',
        entityType: 'work_item',
        outputs: [{
          id: 'result',
          role: 'data',
          type: { base: 'entity', entityType: 'work_item', nullable: false }
        }]
      }
    },
    compiled: { stale: true }
  };
}

describe('persisted producer output identity migration', () => {
  it('rewrites the exact entity output and its derived action context deterministically', () => {
    const result = migrateProducerOutputIdentities(persistedCreate());

    expect(result.errors).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.data.processNodes.processNode_1785860422855.producerOutputId)
      .toBe('processNode_1785860422855:result');
    expect(result.data.producerOutputs['processNode_1785860422855:result']).toEqual({
      producerOutputId: 'processNode_1785860422855:result',
      nodeId: 'processNode_1785860422855',
      outputSocketId: 'result',
      entityType: 'work_item',
      fields: { read: [], write: [], private: [] }
    });
    expect(result.data.compiled).toBeNull();

    expect(migrateProducerOutputIdentities(result.data)).toEqual({
      changed: false,
      data: result.data,
      errors: []
    });
  });

  it('uses the declared catalog result when an older semantic record did not persist sockets', () => {
    const data = persistedCreate();
    delete data.processNodes.processNode_1785860422855.outputs;

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.processNode_1785860422855.producerOutputId)
      .toBe('processNode_1785860422855:result');
  });

  it('moves a detached profile only when one producer owns that entity contract', () => {
    const data = persistedCreate();
    data.entityProfiles = {
      work_item: {
        id: 'work_item',
        entityType: 'work_item',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['identity.*'], write: [], private: [] }
      }
    };

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data).not.toHaveProperty('entityProfiles');
    expect(result.data.producerOutputs['processNode_1785860422855:result']).toMatchObject({
      lifecycle: { mode: 'domainDefault' },
      fields: { read: ['identity.*'], write: [], private: [] }
    });
  });

  it('updates a separately persisted action when it is derived from the effect', () => {
    const data = persistedCreate();
    data.actions.processNode_1785860422855 = {
      id: 'processNode_1785860422855',
      actionKind: 'createEntity',
      entityType: 'work_item'
    };

    const result = migrateProducerOutputIdentities(data);

    expect(result.data.actions.processNode_1785860422855.producerOutputId)
      .toBe('processNode_1785860422855:result');
  });

  it('preserves an update action consuming an upstream producer output', () => {
    const data = persistedCreate();
    data.producerOutputs['source:entity'] = {
      producerOutputId: 'source:entity',
      nodeId: 'source',
      outputSocketId: 'entity',
      entityType: 'work_item',
      fields: { read: [], write: [], private: [] }
    };
    data.processNodes.update = {
      id: 'update',
      kind: 'effect.updateEntity',
      entityType: 'work_item',
      producerOutputId: 'source:entity'
    };

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.update.producerOutputId).toBe('source:entity');
  });

  it('refuses ambiguous same-type outputs with stable node and socket diagnostics', () => {
    const data = persistedCreate();
    data.processNodes.processNode_1785860422855.outputs.push({
      id: 'secondary',
      role: 'data',
      type: { base: 'entity', entityType: 'work_item', nullable: false }
    });

    const result = migrateProducerOutputIdentities(data);

    expect(result.data.processNodes.processNode_1785860422855).not.toHaveProperty('producerOutputId');
    expect(result.errors).toEqual([
      'Process node processNode_1785860422855 requires one work_item producer output; candidates: processNode_1785860422855:result (work_item), processNode_1785860422855:secondary (work_item)'
    ]);
  });
});
