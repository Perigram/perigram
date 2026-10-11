import { describe, expect, it } from 'vitest';
import { validateProcessDefinition } from './index.js';

const domain = {
  entities: [{ type: 'project' }],
  relations: [],
  workflows: {},
  fieldAccess: {
    project: { feature: 'projects', read: ['name'], write: ['identity.name'], admin: [] }
  },
  fieldSchemas: {
    project: [
      { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' }, readable: true, writable: true }
    ]
  },
  construction: { project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] } }
};

function definition(processNodes, edges) {
  return {
    dataflowVersion: 4,
    roles: { operator: { id: 'operator' } },
    producerOutputs: Object.fromEntries(Object.entries(processNodes)
      .filter(([, record]) => record.kind === 'cts.mutate')
      .map(([id, record]) => [`${id}:result`, {
        id: `${id}:result`,
        producerOutputId: `${id}:result`,
        nodeId: id,
        outputSocketId: 'result',
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
    expect(nonOperational(result)[0]).toContain('Process node literal (Literal item) is non-operational');
  });

  it('reports no non-operational nodes when the chain feeds a persistence effect', () => {
    const result = validateProcessDefinition(definition({
      literal: { id: 'literal', kind: 'source.literalItem', type: { base: 'string' }, value: 'Name' },
      update: {
        id: 'update',
        kind: 'cts.mutate',
        typeId: 'project',
        blocks: ['identity'],
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] }
      }
    }, [data('literal', 'update', 'identity.name')]), domain);

    expect(nonOperational(result)).toEqual([]);
  });

  it('reports a branch that dead-ends while its sibling reaches the effect', () => {
    const result = validateProcessDefinition(definition({
      literal: { id: 'literal', kind: 'source.literalItem', type: { base: 'string' }, value: 'Name' },
      orphan: { id: 'orphan', kind: 'cts.field', typeId: 'project', inputDefaults: { field: 'identity.name' } },
      update: {
        id: 'update',
        kind: 'cts.mutate',
        typeId: 'project',
        blocks: ['identity'],
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] }
      }
    }, [
      data('literal', 'orphan', 'entity'),
      data('literal', 'update', 'identity.name')
    ]), domain);

    expect(nonOperational(result).length).toBe(1);
    expect(nonOperational(result)[0]).toContain('Process node orphan');
  });

  it('does not report nodes that only produce effects', () => {
    const result = validateProcessDefinition(definition({
      update: {
        id: 'update',
        kind: 'cts.mutate',
        typeId: 'project',
        blocks: ['identity'],
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] }
      }
    }, []), domain);

    expect(nonOperational(result)).toEqual([]);
  });
});
