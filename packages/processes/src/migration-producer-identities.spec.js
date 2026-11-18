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
        typeId: 'work_item',
        outputs: [{
          id: 'result',
          role: 'data',
          type: { base: 'entity', typeId: 'work_item', nullable: false }
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
      typeId: 'work_item',
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
        typeId: 'work_item',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['name', 'fields.*'], write: [], private: [] }
      }
    };

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data).not.toHaveProperty('entityProfiles');
    expect(result.data.producerOutputs['processNode_1785860422855:result']).toMatchObject({
      lifecycle: { mode: 'domainDefault' },
      fields: { read: ['name', 'fields.*'], write: [], private: [] }
    });
  });

  it('updates a separately persisted action when it is derived from the effect', () => {
    const data = persistedCreate();
    data.actions.processNode_1785860422855 = {
      id: 'processNode_1785860422855',
      actionKind: 'createEntity',
      typeId: 'work_item'
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
      typeId: 'work_item',
      fields: { read: [], write: [], private: [] }
    };
    data.processNodes.update = {
      id: 'update',
      kind: 'effect.updateEntity',
      typeId: 'work_item',
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
      type: { base: 'entity', typeId: 'work_item', nullable: false }
    });

    const result = migrateProducerOutputIdentities(data);

    expect(result.data.processNodes.processNode_1785860422855).not.toHaveProperty('producerOutputId');
    expect(result.errors).toEqual([
      'Process node processNode_1785860422855 requires one work_item producer output; candidates: processNode_1785860422855:result (work_item), processNode_1785860422855:secondary (work_item)'
    ]);
  });

  it('re-derives a twin-lowered self-binding instead of refusing it', () => {
    // Live shape (2026-09-21): a cts.construct lowered to its
    // effect.createEntity twin keeps the authored `X:result` binding while
    // the producer output record is absent — the twin ports re-derive it.
    const data = persistedCreate();
    data.processNodes.processNode_1785860422855.producerOutputId = 'processNode_1785860422855:result';

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.processNode_1785860422855.producerOutputId)
      .toBe('processNode_1785860422855:result');
    expect(result.data.producerOutputs['processNode_1785860422855:result']).toMatchObject({
      nodeId: 'processNode_1785860422855',
      outputSocketId: 'result',
      typeId: 'work_item'
    });
  });

  it('drops a stale self-binding the catalog cannot re-derive', () => {
    // The selected socket is gone (renamed port, withdrawn command
    // output): the binding names no foreign identity, so it is dropped
    // and validation owns the unbound node — never a rewrite refusal.
    const data = persistedCreate();
    delete data.processNodes.processNode_1785860422855.outputs;
    data.processNodes.processNode_1785860422855.kind = 'effect.runCommand';
    data.processNodes.processNode_1785860422855.commandId = 'unknown.command';
    data.processNodes.processNode_1785860422855.producerOutputId = 'processNode_1785860422855:result';
    data.processNodes.processNode_1785860422855.typeId = '';

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.processNode_1785860422855).not.toHaveProperty('producerOutputId');
  });

  it('leaves a withdrawn type to validation instead of refusing the rewrite', () => {
    // SPEC §19 abandoned data: the org deleted the type the node was
    // bound to. The rewrite drops the dead binding silently when the
    // caller supplies a vocabulary; unknown-type diagnostics (with node
    // anchors) belong to validation, not to this rewrite.
    const data = persistedCreate();
    delete data.processNodes.processNode_1785860422855.outputs;
    data.processNodes.processNode_1785860422855.kind = 'effect.runCommand';
    data.processNodes.processNode_1785860422855.commandId = 'unknown.command';
    data.processNodes.processNode_1785860422855.typeId = 'deleted-type';
    data.processNodes.processNode_1785860422855.producerOutputId = 'processNode_1785860422855:result';

    const result = migrateProducerOutputIdentities(data, { entities: [{ type: 'other-type' }] });

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.processNode_1785860422855).not.toHaveProperty('producerOutputId');
  });

  it('assigns producer identity to designer-bypassed cts records through the twin', () => {
    // API-authored drafts never see live designer sync: the persisted
    // rewrite must bind cts origins itself, or execution cannot resolve
    // the producer workflow (status init, lineage) for the created type.
    const data = persistedCreate();
    const node = data.processNodes.processNode_1785860422855;
    node.kind = 'cts.construct';
    node.construction = { mode: 'genericCreate' };

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.processNode_1785860422855.producerOutputId)
      .toBe('processNode_1785860422855:result');
    expect(result.data.producerOutputs['processNode_1785860422855:result']).toMatchObject({
      nodeId: 'processNode_1785860422855',
      outputSocketId: 'result',
      typeId: 'work_item'
    });
  });

  it('still refuses a missing foreign selection', () => {    // A selection naming another node's output that does not exist can
    // mask cross-node corruption — that refusal stays fatal.
    const data = persistedCreate();
    data.processNodes.processNode_1785860422855.kind = 'effect.runCommand';
    data.processNodes.processNode_1785860422855.commandId = 'known.command';
    data.processNodes.processNode_1785860422855.typeId = '';
    data.processNodes.processNode_1785860422855.producerOutputId = 'someone-else:entity';

    const result = migrateProducerOutputIdentities(data);

    expect(result.errors).toEqual([
      'Process node processNode_1785860422855 selects missing producer output someone-else:entity'
    ]);
  });

  it('demands no producer identity for a typed value-output service', () => {
    const result = migrateProducerOutputIdentities({
      dataflowVersion: 5,
      graph: { nodes: [{ id: 'solve', type: 'processNode', data: { refId: 'solve' } }], edges: [] },
      producerOutputs: {},
      actions: {},
      processNodes: {
        solve: {
          id: 'solve',
          kind: 'cts.service',
          typeId: 'nesting-attempt',
          operator: 'plugin.facade.nesting-solve',
          outputs: [{ id: 'result', role: 'data', type: { base: 'json' } }]
        }
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.data.processNodes.solve.producerOutputId).toBeUndefined();
  });
});
