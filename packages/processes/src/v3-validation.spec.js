import { describe, expect, it } from 'vitest';
import { validateProcessDefinition } from './index.js';

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
  commands: {}
};

function definition(record) {
  return {
    dataflowVersion: 3,
    processNodes: { node: { id: 'node', ...record } },
    graph: { nodes: [{ id: 'node', type: 'processNode', data: { refId: 'node' } }], edges: [] }
  };
}

describe('process v3 validation', () => {
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
      kind: 'record.getField',
      path: 'data.guessed',
      type: { base: 'json', shape: 'item' }
    }), domain);
    expect(result.errors).toContain('Process node node uses undeclared field data.guessed');
  });

  it('accepts a status-only entity update through its dedicated lifecycle input', () => {
    const result = validateProcessDefinition(definition({
      kind: 'effect.updateEntity',
      entityType: 'project',
      fields: [],
      trigger: { mode: 'manual' },
      statusRef: 'ready',
      inputDefaults: { 'status.state.primary': 'READY' }
    }), domain);

    expect(result.errors).not.toContain('Process node node must select at least one writable field or status');
  });

  it('enforces entity policy where a structural block enters an effect', () => {
    const result = validateProcessDefinition({
      dataflowVersion: 3,
      processNodes: {
        compose: {
          id: 'compose',
          kind: 'record.composeBlock',
          block: 'data',
          fields: ['data.note']
        },
        create: {
          id: 'create',
          kind: 'effect.createEntity',
          entityType: 'project',
          blocks: ['data'],
          trigger: { mode: 'manual' }
        }
      },
      graph: {
        nodes: ['compose', 'create'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [{
          id: 'compose-create',
          source: 'compose',
          sourceHandle: 'data:block',
          target: 'create',
          targetHandle: 'data:data',
          role: 'data'
        }]
      }
    }, {
      ...domain,
      blockSchemas: {
        ...domain.blockSchemas,
        data: [{ path: 'data.note', block: 'data', type: { base: 'string', shape: 'item' } }]
      }
    });

    expect(result.errors).toContain('Edge compose-create cannot send data.note to project: field is not constructible');
  });
});
