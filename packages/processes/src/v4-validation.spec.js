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
    dataflowVersion: 4,
    processNodes: { node: { id: 'node', ...record } },
    graph: { nodes: [{ id: 'node', type: 'processNode', data: { refId: 'node' } }], edges: [] }
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
      dataflowVersion: 4,
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
      dataflowVersion: 4,
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

  it('requires an explicit lineage key and entity type', () => {
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
    process.processNodes.compose.entries[0].key = 'projectId';
    process.processNodes.compose.entries[0].entityType = 'project';

    const normalized = normalizeProcessDefinition(process, queueDomain);
    const result = validateProcessDefinition(process, queueDomain);

    expect(normalized.processNodes.compose.entries[0]).toMatchObject({
      key: 'projectId',
      entityType: 'project'
    });
    expect(result.errors).not.toContain('Process node compose has a missing or duplicate entry key');
    expect(result.errors).not.toContain('Edge compose-create cannot send lineage. to queue: field is not constructible');
  });

  it('accepts an authored open Lineage block when the target entity declares the block', () => {
    const artifactDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'artifact', blocks: ['lineage'] }, { type: 'nesting_run', blocks: ['identity'] }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        artifact: [{
          path: 'lineage.organizationId',
          block: 'lineage',
          type: { base: 'entityRef', nullable: false, entityType: 'organization' },
          constructible: false,
          writable: false
        }]
      },
      blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', nullable: false } }]
      }
    };
    const process = entityBlockProcess('nesting_run');
    process.processNodes.compose.entries[0].key = 'nestingRunId';
    process.processNodes.create.entityType = 'artifact';

    const normalized = normalizeProcessDefinition(process, artifactDomain);
    const result = validateProcessDefinition(process, artifactDomain);

    expect(normalized.processNodes.create.blocks).toContain('lineage');
    expect(result.errors).not.toContain(
      'Edge compose-create cannot send lineage.nestingRunId to artifact: field is not constructible'
    );
    expect(result.errors).not.toContain('Process node create cannot persist block lineage');
  });

  it('infers a Lineage ancestor entry from its connected entity output', () => {
    const process = entityBlockProcess('');
    process.processNodes.compose.entries[0] = {
      id: 'entry_parent',
      key: '',
      entityType: ''
    };
    process.processNodes.parent = {
      id: 'parent',
      kind: 'effect.createEntity',
      entityType: 'project',
      construction: { mode: 'genericCreate', inputs: [] },
      blocks: ['identity'],
      trigger: { mode: 'manual' }
    };
    process.graph.nodes.push({ id: 'parent', type: 'processNode', data: { refId: 'parent' } });
    process.graph.edges.push({
      id: 'parent-compose',
      source: 'parent',
      target: 'compose',
      sourceHandle: 'data:result',
      targetHandle: 'data:entry:entry_parent'
    });

    const normalized = normalizeProcessDefinition(process, domain);

    expect(normalized.processNodes.compose.entries).toEqual([{
      id: 'entry_parent',
      key: 'projectId',
      entityType: 'project'
    }]);
  });

  it('keeps an explicitly authored lineage type when normalizing the saved graph', () => {
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
    process.processNodes.compose.entries[0].key = 'projectId';
    delete process.processNodes.compose.inputDefaults;

    const normalized = normalizeProcessDefinition(process, queueDomain);

    expect(normalized.processNodes.compose.entries[0]).toMatchObject({
      key: 'projectId',
      entityType: 'project'
    });
  });

  it('accepts explicitly authored open relation entries without cardinality metadata', () => {
    const relationDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'library', blocks: ['identity', 'relations'] }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        project: [
          ...domain.fieldSchemas.project,
          {
            path: 'relations.value',
            block: 'relations',
            type: { base: 'json', shape: 'item' },
            constructible: true,
            writable: false
          }
        ]
      },
      blockComposition: { relations: { mode: 'relations', valueBase: 'entityRef' } },
      blockSchemas: {
        ...domain.blockSchemas,
        relations: [{ path: 'relations', block: 'relations', type: { base: 'map', shape: 'item' } }]
      }
    };
    const process = {
      dataflowVersion: 4,
      processNodes: {
        library: {
          id: 'library',
          kind: 'effect.createEntity',
          entityType: 'library',
          blocks: ['identity'],
          construction: { mode: 'genericCreate' },
          status: { to: 'NEW' },
          trigger: { mode: 'manual' }
        },
        compose: {
          id: 'compose',
          kind: 'record.composeBlock',
          block: 'relations',
          compositionMode: 'relations',
          entries: [{ id: 'library', key: 'library', entityType: 'library' }]
        },
        create: {
          id: 'create',
          kind: 'effect.createEntity',
          entityType: 'project',
          blocks: ['relations'],
          construction: { mode: 'genericCreate' },
          status: { to: 'NEW' },
          trigger: { mode: 'manual' }
        }
      },
      graph: {
        nodes: ['library', 'compose', 'create'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'library-compose', source: 'library', sourceHandle: 'data:result', target: 'compose', targetHandle: 'data:entry:library', role: 'data' },
          { id: 'compose-create', source: 'compose', sourceHandle: 'data:block', target: 'create', targetHandle: 'data:relations', role: 'data' }
        ]
      }
    };

    const result = validateProcessDefinition(process, relationDomain);

    expect(result.definition.processNodes.compose.entries[0]).toMatchObject({
      key: 'library',
      entityType: 'library',
      entityType: 'library'
    });
    expect(result.errors).not.toContain(
      'Edge compose-create cannot send relations.library to project: composed entry type does not match the entity field'
    );
    expect(result.errors).not.toContain(
      'Edge compose-create cannot send relations.library to project: field is not constructible'
    );
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
          kind: 'record.modifyBlock',
          block: 'relations',
          compositionMode: 'relations',
          entries: [{ id: 'library', key: 'library', entityType: 'library', cardinality: 'one', operation: 'mergeMaybe' }]
        }
      },
      graph: { nodes: [{ id: 'modify', type: 'processNode', data: { refId: 'modify' } }], edges: [] }
    };

    const result = validateProcessDefinition(process, relationDomain);
    expect(result.definition.processNodes.modify.entries[0]).toEqual({
      id: 'library',
      key: 'library',
      entityType: 'library'
    });
    expect(result.errors.some(error => error.includes('relation mutation'))).toBe(false);
  });

  it('resolves a connected entity output through the graph port contract', () => {
    const queueDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'queue', blocks: ['lineage'] }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        queue: [{
          path: 'lineage.projectId',
          block: 'lineage',
          type: { base: 'entityRef', shape: 'item', entityType: 'project' },
          constructible: true
        }]
      },
      blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
      blockSchemas: { ...domain.blockSchemas, lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', shape: 'item' } }] }
    };
    const process = entityBlockProcess('project');
    process.processNodes.source = {
      id: 'source',
      kind: 'source.literalItem',
      type: { base: 'entityRef', shape: 'item', entityType: 'project' },
      value: { type: 'project', id: 'project-1' }
    };
    process.graph.nodes.push({ id: 'source', type: 'processNode', data: { refId: 'source' } });
    process.graph.edges.push({
      id: 'source-compose',
      source: 'source',
      sourceHandle: 'data:value',
      target: 'compose',
      targetHandle: 'data:entry:project',
      role: 'data'
    });
    process.processNodes.compose.entries[0] = { id: 'project', key: 'projectId', entityType: 'project' };
    delete process.processNodes.compose.inputDefaults;

    expect(() => normalizeProcessDefinition(process, queueDomain)).not.toThrow();
    expect(normalizeProcessDefinition(process, queueDomain).processNodes.compose.entries[0])
      .toMatchObject({ key: 'projectId', entityType: 'project' });
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

  it('removes stale create blocks that the current entity contract no longer constructs', () => {
    const cassetteDomain = {
      ...domain,
      entities: [{ type: 'cassette_design', blocks: ['identity', 'data'] }],
      construction: {
        cassette_design: {
          modes: ['bakeCassetteDesignFromTemplate'],
          defaultMode: 'bakeCassetteDesignFromTemplate',
          derived: true,
          inputs: []
        }
      },
      fieldSchemas: {
        cassette_design: [
          { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' }, constructible: false },
          { path: 'data.value', block: 'data', type: { base: 'json', shape: 'item' }, constructible: true }
        ]
      }
    };
    const process = definition({
      kind: 'effect.createEntity',
      entityType: 'cassette_design',
      blocks: ['identity', 'data'],
      construction: { mode: 'bakeCassetteDesignFromTemplate' },
      inputDefaults: { 'identity.name': 'Old design name', 'data.value': { A: 10 } },
      trigger: { mode: 'manual' }
    });

    const normalized = normalizeProcessDefinition(process, cassetteDomain);

    expect(normalized.processNodes.node.blocks).toEqual(['data']);
    expect(normalized.processNodes.node.inputDefaults).toEqual({
      'data.value': { branches: [{ path: [], items: [{ A: 10 }] }] }
    });
    expect(validateProcessDefinition(process, cassetteDomain).errors)
      .not.toContain('Process node node cannot persist block identity');
  });

  it('rejects create effects when the entity service lacks create support', () => {
    const result = validateProcessDefinition(definition({
      kind: 'effect.createEntity',
      entityType: 'project',
      construction: { mode: 'genericCreate' },
      trigger: { mode: 'manual' }
    }), domain, { capabilities: { project: { create: false, processUpdate: true, delete: true, archive: false } } });

    expect(result.errors).toContain('Process node node cannot create project: entity service lacks create support');
  });

  it('rejects update effects when the entity service lacks processUpdate support', () => {
    const result = validateProcessDefinition(definition({
      kind: 'effect.updateEntity',
      entityType: 'project',
      trigger: { mode: 'manual' },
      statusRef: 'ready',
      inputDefaults: { 'status.state.primary': 'READY' }
    }), domain, { capabilities: { project: { create: true, processUpdate: false, delete: true, archive: false } } });

    expect(result.errors).toContain('Process node node cannot update project: entity service lacks processUpdate support');
  });

  it('rejects change status effects when the entity has no status workflow', () => {
    const result = validateProcessDefinition(definition({
      kind: 'effect.changeStatus',
      entityType: 'project',
      trigger: { mode: 'manual' },
      inputDefaults: { 'status.state.primary': 'READY' }
    }), domain, { capabilities: { project: { create: true, processUpdate: true, delete: true, archive: false } } });

    expect(result.errors).toContain('Process node node cannot change project: entity has no status workflow');
  });

  it('does not enforce capabilities when none are supplied', () => {
    const result = validateProcessDefinition(definition({
      kind: 'effect.createEntity',
      entityType: 'project',
      construction: { mode: 'genericCreate' },
      status: { to: 'NEW' },
      trigger: { mode: 'manual' }
    }), domain);

    expect(result.errors).toEqual([]);
  });
});

function entityBlockProcess(entityType) {
  return {
    dataflowVersion: 4,
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
