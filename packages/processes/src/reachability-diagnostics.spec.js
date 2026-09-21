import { describe, expect, it } from 'vitest';
import { validateProcessDefinition } from './index.js';

const domain = {
  entities: [{ type: 'project' }],
  relations: [],
  workflows: {},
  fieldAccess: {
    project: { feature: 'projects', read: ['identity.*'], write: ['identity.name'], admin: [] }
  },
  construction: { project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] } }
};

function node(id, record) {
  return { id, type: 'processNode', data: { refId: id }, record };
}

function definition(processNodes, edges) {
  return {
    dataflowVersion: 4,
    roles: { operator: { id: 'operator' } },
    producerOutputs: Object.fromEntries(Object.entries(processNodes)
      .filter(([, record]) => record.kind === 'effect.updateEntity')
      .map(([id, record]) => [`${id}:entity`, {
        id: `${id}:entity`,
        producerOutputId: `${id}:entity`,
        nodeId: id,
        outputSocketId: 'entity',
        typeId: record.typeId,
        lifecycle: { mode: 'defaultCreated' },
        fields: { read: [], write: ['identity.name'], private: [] }
      }])),
    processNodes,
    graph: {
      nodes: Object.keys(processNodes).map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges
    }
  };
}

const data = (source, target, targetHandle) => ({
  id: `${source}-${target}`,
  source,
  sourceHandle: 'data:value',
  target,
  targetHandle: `data:${targetHandle}`,
  role: 'data'
});

function nonOperational(result) {
  return result.warnings.filter(warning => warning.includes('non-operational'));
}

describe('unreachable node diagnostics', () => {
  it('keeps an inspect-only pure-data subgraph valid while reporting it as non-operational', () => {
    const result = validateProcessDefinition(definition({
      literal: { id: 'literal', kind: 'source.literalItem', type: { base: 'string' }, value: 'Orphan' },
      list: { id: 'list', kind: 'collection.makeList', type: { base: 'string' } }
    }, [data('literal', 'list', 'item1')]), domain);

    expect(result.ok).toBe(true);
    expect(nonOperational(result).length).toBe(2);
    expect(nonOperational(result)[0]).toContain('Process node literal (source.literalItem) is non-operational');
  });

  it('reports no non-operational nodes when the chain feeds a persistence effect', () => {
    const result = validateProcessDefinition(definition({
      literal: { id: 'literal', kind: 'source.literalItem', type: { base: 'string' }, value: 'Name' },
      update: {
        id: 'update',
        kind: 'effect.updateEntity',
        typeId: 'project',
        producerOutputId: 'update:entity',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        fields: ['identity.name']
      }
    }, [data('literal', 'update', 'identity.name')]), domain);

    expect(nonOperational(result)).toEqual([]);
  });

  it('reports a branch that dead-ends while its sibling reaches the effect', () => {
    const result = validateProcessDefinition(definition({
      literal: { id: 'literal', kind: 'source.literalItem', type: { base: 'string' }, value: 'Name' },
      orphan: { id: 'orphan', kind: 'record.getField', path: 'identity.name', type: { base: 'string' } },
      update: {
        id: 'update',
        kind: 'effect.updateEntity',
        typeId: 'project',
        producerOutputId: 'update:entity',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        fields: ['identity.name']
      }
    }, [
      data('literal', 'orphan', 'value'),
      data('literal', 'update', 'identity.name')
    ]), domain);

    expect(nonOperational(result).length).toBe(1);
    expect(nonOperational(result)[0]).toContain('Process node orphan');
  });

  it('does not report nodes that only produce effects', () => {
    const result = validateProcessDefinition(definition({
      update: {
        id: 'update',
        kind: 'effect.updateEntity',
        typeId: 'project',
        producerOutputId: 'update:entity',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        fields: []
      }
    }, []), domain);

    expect(nonOperational(result)).toEqual([]);
  });
});
