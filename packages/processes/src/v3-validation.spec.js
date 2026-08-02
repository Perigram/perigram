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

  it('accepts declared open-block entries and rejects invented lineage slots', () => {
    const lineageDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'organization', blocks: ['identity'] }],
      containment: [{ parentType: 'organization', childType: 'project', lineageKey: 'organizationId' }],
      blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', shape: 'item' } }]
      }
    };
    const valid = validateProcessDefinition(definition({
      kind: 'record.composeBlock',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [{ id: 'organization', key: 'organizationId', entityType: 'organization' }],
      inputDefaults: { 'entry:organization': { type: 'organization', id: 'org-1' } }
    }), lineageDomain);
    const invalid = validateProcessDefinition(definition({
      kind: 'record.composeBlock',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [{ id: 'invented', key: 'madeUpId', entityType: 'project' }],
      inputDefaults: { 'entry:invented': { type: 'project', id: 'project-1' } }
    }), lineageDomain);

    expect(valid.errors).toEqual([]);
    expect(invalid.errors).toContain('Process node node entry invented must select a declared lineage slot');
  });

  it('checks authored open-block keys against the consuming entity policy', () => {
    const result = validateProcessDefinition({
      dataflowVersion: 3,
      processNodes: {
        compose: {
          id: 'compose',
          kind: 'record.composeBlock',
          block: 'data',
          compositionMode: 'entries',
          entries: [{ id: 'secret', key: 'secret', type: { base: 'string', shape: 'item' } }],
          inputDefaults: { 'entry:secret': 'hidden' }
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
      blockComposition: { data: { mode: 'entries', valueBase: 'json' } },
      blockSchemas: {
        ...domain.blockSchemas,
        data: [{ path: 'data', block: 'data', type: { base: 'json', shape: 'item' } }]
      }
    });

    expect(result.errors).toContain('Edge compose-create cannot send data.secret to project: field is not constructible');
  });
});
