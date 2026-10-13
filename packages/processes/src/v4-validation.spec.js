import { describe, expect, it } from 'vitest';
import { normalizeProcessDefinition, validateProcessDefinition } from './index.js';

const domain = {
  entities: [{ type: 'project', blocks: ['identity'] }],
  fieldSchemas: {
    project: [{
      path: 'identity.name',
      block: 'identity',
      type: { base: 'string', shape: 'item', nullable: false },
      readable: true,
      writable: true
    }]
  },
  blockSchemas: {
    identity: [{ path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item', nullable: false } }]
  },
  construction: {
    project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] }
  },
  commands: {}
};

function definition(record, extras = {}) {
  return {
    dataflowVersion: 4,
    processNodes: { node: { id: 'node', ...record } },
    graph: { nodes: [{ id: 'node', type: 'processNode', data: { refId: 'node' } }], edges: [] },
    ...extras
  };
}

describe('process v4 validation', () => {
  it('accepts catalog nodes with structured types', () => {
    const result = validateProcessDefinition(definition({
      kind: 'source.literalItem',
      type: { base: 'string', shape: 'item' },
      value: 'hello'
    }), domain);
    expect(result.errors).toEqual([]);
  });

  it('rejects field paths that are not in the domain schema', () => {
    const result = validateProcessDefinition(definition({
      kind: 'cts.field',
      typeId: 'project',
      inputDefaults: { field: 'data.guessed' }
    }), domain);
    expect(result.errors).toContain('Process node node uses undeclared field data.guessed');
  });

  it('accepts a status-only entity update through its dedicated lifecycle input', () => {
    const result = validateProcessDefinition(definition({
      kind: 'cts.mutate',
      typeId: 'project',
      trigger: { mode: 'manual' },
      stateRef: 'ready',
      inputDefaults: { state: 'READY' }
    }), domain);

    expect(result.errors).not.toContain('Process node node must accept at least one writable block or status');
  });

  it('removes obsolete relation cardinality and mutation metadata', () => {
    const relationDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'library', blocks: ['relations'] }],
      blockComposition: { relations: { mode: 'relations', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        relations: [{ path: 'relations', block: 'relations', type: { base: 'map', shape: 'item' } }]
      }
    };
    const process = {
      dataflowVersion: 4,
      processNodes: {
        modify: {
          id: 'modify',
          kind: 'cts.compose',
          block: 'relations',
          compositionMode: 'relations',
          entries: [{ id: 'library', key: 'library', typeId: 'library', cardinality: 'one', operation: 'mergeMaybe' }]
        }
      },
      graph: { nodes: [{ id: 'modify', type: 'processNode', data: { refId: 'modify' } }], edges: [] }
    };

    const result = validateProcessDefinition(process, relationDomain);
    expect(result.definition.processNodes.modify.entries[0]).toEqual({
      id: 'library',
      key: 'library',
      typeId: 'library'
    });
    expect(result.errors.some(error => error.includes('relation mutation'))).toBe(false);
  });

  it('rejects constructs when the construction mode has no registered handler', () => {
    const result = validateProcessDefinition(definition({
      kind: 'cts.construct',
      typeId: 'project',
      construction: { mode: 'genericCreate' },
      trigger: { mode: 'manual' }
    }), domain, { capabilities: { project: { create: false, createModes: [], processUpdate: true, delete: true, archive: false } } });

    expect(result.errors).toContain('Process node node cannot create project with construction mode genericCreate: no registered runtime handler');
  });

  it('rejects mutates when the entity service lacks processUpdate support', () => {
    const result = validateProcessDefinition(definition({
      kind: 'cts.mutate',
      typeId: 'project',
      trigger: { mode: 'manual' },
      stateRef: 'ready',
      inputDefaults: { state: 'READY' }
    }), domain, { capabilities: { project: { create: true, processUpdate: false, delete: true, archive: false } } });

    expect(result.errors).toContain('Process node node cannot update project: entity service lacks processUpdate support');
  });

  it('rejects transitions when the entity has no status workflow', () => {
    const result = validateProcessDefinition(definition({
      kind: 'cts.transition',
      typeId: 'project',
      trigger: { mode: 'manual' },
      inputDefaults: { state: 'READY' }
    }), domain, { capabilities: { project: { create: true, processUpdate: true, delete: true, archive: false } } });

    expect(result.errors).toContain('Process node node cannot change project: entity has no status workflow');
  });

  it('accepts transitions when the draft seeds the vocabulary (SPEC §7: machines are graph-derived)', () => {
    // The domain channel alone never carries an org-type machine (the
    // projection emits none): the draft's own state nodes satisfy the
    // gate, typed or wire-bound.
    const capabilities = { project: { create: true, processUpdate: true, delete: true, archive: false } };
    const typed = validateProcessDefinition(definition({
      kind: 'cts.transition',
      typeId: 'project',
      trigger: { mode: 'manual' },
      inputDefaults: { state: 'READY' }
    }, {
      ctsTypes: {
        st_ready: { id: 'st_ready', kind: 'state', typeId: 'project', value: 'ready' }
      }
    }), domain, { capabilities });
    expect(typed.errors).not.toContain('Process node node cannot change project: entity has no status workflow');

    const wired = validateProcessDefinition(definition({
      kind: 'cts.transition',
      typeId: 'project',
      trigger: { mode: 'manual' },
      inputDefaults: { state: 'READY' }
    }, {
      ctsTypes: {
        st_ready: { id: 'st_ready', kind: 'state', value: 'ready' }
      },
      graph: {
        nodes: [
          { id: 'node', type: 'processNode', data: { refId: 'node' } },
          { id: 'st_ready', type: 'ctsState', data: { refId: 'st_ready' } }
        ],
        edges: [{ id: 'entry', source: 'st_ready', target: 'node' }]
      }
    }), domain, { capabilities });
    expect(wired.errors).not.toContain('Process node node cannot change project: entity has no status workflow');
  });

  it.each([
    ['archive', 'archive'],
    ['delete', 'delete']
  ])('rejects species %s when the canonical runtime capability is denied', (verb, expectedVerb) => {
    const record = verb === 'archive'
      ? {
        kind: 'cts.transition',
        typeId: 'project',
        archiveIntent: 'archiveProject',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [] }
      }
      : {
        kind: 'cts.remove',
        typeId: 'project',
        trigger: { mode: 'manual' },
        access: { level: 'admin', grants: [] }
      };
    const result = validateProcessDefinition(definition(record), domain, {
      capabilities: { project: { [expectedVerb]: false } }
    });

    expect(result.errors).toContain(`Process node node cannot ${expectedVerb} project: entity service lacks ${expectedVerb} support`);
  });

  it('derives hard deletion as an admin-only manual compiled action', () => {
    const deleteDefinition = definition({
      kind: 'cts.remove',
      typeId: 'project',
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [] }
    });
    const normalized = normalizeProcessDefinition(deleteDefinition, {
      ...domain,
      entities: [{ ...domain.entities[0], operations: { delete: true } }]
    });

    expect(normalized.actions.node).toMatchObject({
      actionKind: 'deleteEntity',
      typeId: 'project',
      trigger: { mode: 'manual' },
      access: { level: 'admin' }
    });
    const denied = validateProcessDefinition(definition({
      kind: 'cts.remove',
      typeId: 'project',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    }), domain);
    expect(denied.errors).toContain('Action node must use admin access for hard deletion');

    const automatic = validateProcessDefinition(definition({
      kind: 'cts.remove',
      typeId: 'project',
      trigger: { mode: 'automatic' },
      access: { level: 'admin', grants: [] }
    }), domain);
    expect(automatic.errors).toContain('Action node hard deletion must be manual');
  });

  it('keeps status scope and the authored archive intent on the transition record', () => {
    const scopedStatus = normalizeProcessDefinition(definition({
      kind: 'cts.transition',
      typeId: 'project',
      region: 'quality',
      path: ['review', 'approved'],
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    }), domain);
    expect(scopedStatus.processNodes.node).toMatchObject({ region: 'quality', path: ['review', 'approved'] });

    const archived = normalizeProcessDefinition(definition({
      kind: 'cts.transition',
      typeId: 'project',
      archiveIntent: 'archiveProject',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    }), domain);
    expect(archived.processNodes.node.archiveIntent).toBe('archiveProject');
    expect(archived.actions.node.actionKind).toBe('archiveEntity');
  });

  it('does not enforce capabilities when none are supplied', () => {
    const result = validateProcessDefinition(definition({
      kind: 'cts.construct',
      typeId: 'project',
      producerOutputId: 'node:result',
      construction: { mode: 'genericCreate' },
      state: { to: 'NEW' },
      trigger: { mode: 'manual' }
    }, {
      producerOutputs: {
        'node:result': {
          id: 'node:result',
          producerOutputId: 'node:result',
          nodeId: 'node',
          outputSocketId: 'result',
          typeId: 'project',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: [], write: [], private: [] }
        }
      }
    }), domain);

    expect(result.errors).toEqual([]);
  });

  it('accepts one wire per Make List item socket and rejects a second wire into the same socket', () => {
    const makeListProcess = edges => ({
      dataflowVersion: 4,
      processNodes: {
        first: { id: 'first', kind: 'source.literalItem', type: { base: 'string' }, value: 'a' },
        second: { id: 'second', kind: 'source.literalItem', type: { base: 'string' }, value: 'b' },
        list: { id: 'list', kind: 'collection.makeList', type: { base: 'string' } }
      },
      graph: {
        nodes: ['first', 'second', 'list'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges
      }
    });
    const wire = (id, source, targetHandle) => ({
      id,
      source,
      sourceHandle: 'data:value',
      target: 'list',
      targetHandle,
      role: 'data'
    });

    const accepted = validateProcessDefinition(makeListProcess([
      wire('e1', 'first', 'data:item1'),
      wire('e2', 'second', 'data:item2')
    ]), domain);
    expect(accepted.errors).toEqual([]);

    const rejected = validateProcessDefinition(makeListProcess([
      wire('e1', 'first', 'data:item1'),
      wire('e2', 'second', 'data:item1')
    ]), domain);
    expect(rejected.errors).toContain('Process node list input item1 has more than one connected value');
  });

  it('rejects a Make List wire whose element type is incompatible with the node type', () => {
    const result = validateProcessDefinition({
      dataflowVersion: 4,
      processNodes: {
        source: { id: 'source', kind: 'source.literalItem', type: { base: 'string' }, value: 'a' },
        list: { id: 'list', kind: 'collection.makeList', type: { base: 'entityRef', typeId: 'queue' } }
      },
      graph: {
        nodes: ['source', 'list'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [{
          id: 'e1',
          source: 'source',
          sourceHandle: 'data:value',
          target: 'list',
          targetHandle: 'data:item1',
          role: 'data'
        }]
      }
    }, domain);

    expect(result.errors.some(error => error.startsWith('Edge e1 is incompatible:'))).toBe(true);
  });
});
