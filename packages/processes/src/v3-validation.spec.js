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

  it('keeps open-block lineage entries generic and requires an authored key', () => {
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
    const generic = validateProcessDefinition(definition({
      kind: 'record.composeBlock',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [{ id: 'invented', key: 'madeUpId', entityType: 'project' }],
      inputDefaults: { 'entry:invented': { type: 'project', id: 'project-1' } }
    }), lineageDomain);
    const invalid = validateProcessDefinition(definition({
      kind: 'record.composeBlock',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [{ id: 'missing', key: '', entityType: 'project' }],
      inputDefaults: { 'entry:missing': { type: 'project', id: 'project-1' } }
    }), lineageDomain);

    expect(valid.errors).toEqual([]);
    expect(generic.errors).toEqual([]);
    expect(invalid.errors).toContain('Process node node has a missing or duplicate entry key');
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

  it('rejects a lineage entry whose reference type disagrees with the consuming entity field', () => {
    const queueDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'queue', blocks: ['lineage'] }, { type: 'warehouse', blocks: ['identity'] }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        queue: [{
          path: 'lineage.projectId',
          block: 'lineage',
          type: { base: 'entityRef', shape: 'item', nullable: false, entityType: 'project' },
          constructible: true,
          writable: true
        }]
      },
      blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', shape: 'item' } }]
      }
    };
    const process = entityBlockProcess('warehouse');
    const rejected = validateProcessDefinition(process, queueDomain);
    const accepted = validateProcessDefinition(entityBlockProcess('project'), queueDomain);

    expect(rejected.errors).toContain('Edge compose-create cannot send lineage.projectId to queue: composed entry type does not match the entity field');
    expect(accepted.errors).not.toContain('Edge compose-create cannot send lineage.projectId to queue: composed entry type does not match the entity field');
  });

  it('infers a lineage field from the connected entity and consuming create schema', () => {
    const queueDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'queue', blocks: ['lineage'] }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        queue: [{
          path: 'lineage.projectId',
          block: 'lineage',
          type: { base: 'entityRef', shape: 'item', nullable: false, entityType: 'project' },
          constructible: true,
          writable: true
        }]
      },
      blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', shape: 'item' } }]
      }
    };
    const process = entityBlockProcess('project');
    process.processNodes.compose.entries[0].key = '';
    process.processNodes.compose.entries[0].entityType = '';

    const normalized = normalizeProcessDefinition(process, queueDomain);
    const result = validateProcessDefinition(process, queueDomain);

    expect(normalized.processNodes.compose.entries[0]).toMatchObject({
      key: 'projectId',
      entityType: 'project'
    });
    expect(result.errors).not.toContain('Process node compose has a missing or duplicate entry key');
    expect(result.errors).not.toContain('Edge compose-create cannot send lineage. to queue: field is not constructible');
  });

  it('keeps a socket-inferred lineage type when normalizing the saved graph', () => {
    const queueDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'queue', blocks: ['lineage'] }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        queue: [{
          path: 'lineage.projectId',
          block: 'lineage',
          type: { base: 'entityRef', shape: 'item', nullable: false, entityType: 'project' },
          constructible: true,
          writable: true
        }]
      },
      blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', shape: 'item' } }]
      }
    };
    const process = entityBlockProcess('project');
    process.processNodes.compose.entries[0].key = '';
    delete process.processNodes.compose.inputDefaults;

    const normalized = normalizeProcessDefinition(process, queueDomain);

    expect(normalized.processNodes.compose.entries[0]).toMatchObject({
      key: 'projectId',
      entityType: 'project'
    });
  });

  it('rejects service-owned identity uid in block authoring', () => {
    const result = validateProcessDefinition(definition({
      kind: 'record.composeBlock',
      block: 'identity',
      fields: ['identity.uid'],
      inputDefaults: { 'identity.uid': 'user-supplied-id' }
    }), {
      ...domain,
      blockSchemas: {
        identity: [{
          path: 'identity.uid',
          block: 'identity',
          type: { base: 'string', shape: 'item', nullable: true },
          readable: true,
          writable: false,
          constructible: false
        }]
      }
    });

    expect(result.errors).toContain('Process node node cannot compose managed field identity.uid');
  });
});

function entityBlockProcess(entityType) {
  return {
    dataflowVersion: 3,
    processNodes: {
      compose: {
        id: 'compose',
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [{ id: 'project', key: 'projectId', entityType }],
        inputDefaults: { 'entry:project': { type: entityType, id: 'parent-1' } }
      },
      create: {
        id: 'create',
        kind: 'effect.createEntity',
        entityType: 'queue',
        blocks: ['lineage'],
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
        targetHandle: 'data:lineage',
        role: 'data'
      }]
    }
  };
}
