import { describe, expect, it } from 'vitest';
import { migrateProcessDataflowDefinition } from './dataflow-migration.js';
import { PROCESS_TEMPLATES, createProcessFromTemplate } from './templates.js';
import { validateProcessDefinition } from './index.js';
import { cncDomain } from '../../domain-cnc/src/index.js';

describe('process v3 data-flow migration', () => {
  it('moves literals, reads, field changes, and effects into one operation registry', () => {
    const result = migrateProcessDataflowDefinition({
      dataflowVersion: 2,
      compiled: { stale: true },
      valueInputs: {
        name: { id: 'name', valueType: 'string', value: 'A' }
      },
      processNodes: {
        query: { id: 'query', kind: 'entityQuery', entityType: 'queue' },
        change: { id: 'change', kind: 'blockCompose', block: 'identity', path: 'name' }
      },
      actions: {
        update: {
          id: 'update',
          actionKind: 'updateEntity',
          entityType: 'queue',
          inputs: [{ id: 'data', dataPath: 'identity.name' }]
        }
      },
      graph: {
        nodes: [
          { id: 'name', type: 'valueInput' },
          { id: 'query', type: 'processNode' },
          { id: 'change', type: 'processNode' },
          { id: 'update', type: 'action' }
        ],
        edges: [
          { id: 'literal-change', source: 'name', sourceHandle: 'value', target: 'change', targetHandle: 'input:value' },
          { id: 'change-update', source: 'change', sourceHandle: 'change', target: 'update', targetHandle: 'input:data' }
        ]
      }
    }, cncDomain);

    expect(result.changed).toBe(true);
    expect(result.value.dataflowVersion).toBe(3);
    expect(result.value.compiled).toBeNull();
    expect(result.value.valueInputs).toEqual({});
    expect(result.value.processNodes['source:name']).toMatchObject({
      kind: 'source.literalItem',
      type: { base: 'string', shape: 'item' }
    });
    expect(result.value.processNodes.query).toBeUndefined();
    expect(result.value.processNodes.change).toBeUndefined();
    expect(result.value.processNodes['effect:update']).toMatchObject({
      kind: 'effect.updateEntity',
      fields: [],
      blocks: ['identity'],
      trigger: { mode: 'manual' },
      entryTriggerId: 'effect:update'
    });
    const identityComposer = Object.values(result.value.processNodes)
      .find(node => node.kind === 'record.composeBlock' && node.block === 'identity');
    expect(identityComposer).toMatchObject({ fields: ['identity.name'], entityType: 'queue' });
    expect(result.value.processNodes['trigger:update']).toBeUndefined();
    expect(result.value.processNodes['current:entity:update']).toBeUndefined();
    expect(result.value.processNodes['ref:entity:update']).toBeUndefined();
    expect(result.value.processNodes['effect:update'].entryTriggerId).toBe('effect:update');
    expect(result.value.graph.nodes.every(node => node.type === 'processNode')).toBe(true);
    expect(result.value.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'name', sourceHandle: 'data:value', targetHandle: 'data:identity.name', role: 'data' }),
      expect.objectContaining({ sourceHandle: 'data:block', target: 'update', targetHandle: 'data:identity', role: 'data' })
    ]));
  });

  it('stops rather than guessing how to migrate an unknown node kind', () => {
    expect(() => migrateProcessDataflowDefinition({
      dataflowVersion: 2,
      processNodes: { mystery: { id: 'mystery', kind: 'placeholder' } },
      graph: { nodes: [{ id: 'mystery', type: 'processNode' }], edges: [] }
    })).toThrow('Cannot migrate process node mystery');
  });

  it('removes definition-plane status nodes instead of treating them as executable values', () => {
    const result = migrateProcessDataflowDefinition({
      dataflowVersion: 2,
      statusDefinitions: { ready: { id: 'ready', statusId: 'READY' } },
      graph: {
        nodes: [{ id: 'ready', type: 'statusDefinition' }],
        edges: []
      }
    });
    expect(result.value.graph.nodes).toEqual([]);
    expect(result.value.statusDefinitions.ready.statusId).toBe('READY');
  });

  it('preserves typed status value nodes in an existing v3 graph', () => {
    const source = {
      dataflowVersion: 3,
      statusDefinitions: { ready: { id: 'ready', statusId: 'READY' } },
      processNodes: {
        update: {
          id: 'update',
          kind: 'effect.updateEntity',
          entityType: 'project',
          fields: [],
          statusRef: 'ready'
        }
      },
      graph: {
        nodes: [
          { id: 'ready', type: 'statusDefinition', data: { refId: 'ready' } },
          { id: 'update', type: 'processNode', data: { refId: 'update' } }
        ],
        edges: [{
          id: 'ready-update',
          source: 'ready',
          sourceHandle: 'data:status',
          target: 'update',
          targetHandle: 'data:status.state.primary',
          role: 'data'
        }]
      }
    };

    const result = migrateProcessDataflowDefinition(source);
    expect(result.changed).toBe(true);
    expect(result.value.graph).toEqual(source.graph);
    expect(result.value.processNodes.update.trigger).toEqual({ mode: 'manual' });
  });

  it('collapses effect start modes to manual or automatic socket input', () => {
    const result = migrateProcessDataflowDefinition({
      dataflowVersion: 3,
      processNodes: {
        changed: {
          id: 'changed',
          kind: 'effect.updateEntity',
          entityType: 'project',
          trigger: { mode: 'entityChanged' },
          eventId: 'project.updated'
        }
      },
      graph: {
        nodes: [{ id: 'changed', type: 'processNode', data: { refId: 'changed' } }],
        edges: []
      }
    });

    expect(result.changed).toBe(true);
    expect(result.value.processNodes.changed.trigger).toEqual({ mode: 'event' });
    expect(result.value.processNodes.changed.eventId).toBeUndefined();
  });

  it('turns legacy status-transition wiring into independent current-entity effects', () => {
    const source = {
      dataflowVersion: 2,
      actions: {
        statusA: {
          id: 'statusA',
          actionKind: 'changeStatus',
          entityType: 'project',
          status: { from: 'OPEN', to: 'CLOSED' },
          inputs: [{ id: 'entity', entityType: 'project' }, { id: 'status', kind: 'status' }],
          outputs: [{ id: 'entity', entityType: 'project' }]
        },
        statusB: {
          id: 'statusB',
          actionKind: 'changeStatus',
          entityType: 'project',
          status: { from: 'CLOSED', to: 'OPEN' },
          inputs: [{ id: 'entity', entityType: 'project' }, { id: 'status', kind: 'status' }],
          outputs: [{ id: 'entity', entityType: 'project' }]
        }
      },
      graph: {
        nodes: [
          { id: 'statusA', type: 'action', position: { x: 100, y: 0 }, data: { refId: 'statusA' } },
          { id: 'statusB', type: 'action', position: { x: 300, y: 0 }, data: { refId: 'statusB' } }
        ],
        edges: [
          { id: 'a-b', source: 'statusA', sourceHandle: 'output', target: 'statusB', targetHandle: 'input:entity' },
          { id: 'b-a', source: 'statusB', sourceHandle: 'output', target: 'statusA', targetHandle: 'input:entity' }
        ]
      }
    };

    const migrated = migrateProcessDataflowDefinition(source, cncDomain).value;

    expect(migrated.graph.edges.some(edge => edge.id === 'a-b' || edge.id === 'b-a')).toBe(false);
    expect(migrated.processNodes['status:statusA'].value).toBe('CLOSED');
    expect(migrated.processNodes['status:statusB'].value).toBe('OPEN');
    expect(migrated.graph.edges.filter(edge => edge.target === 'statusA' && edge.targetHandle === 'data:entity')).toHaveLength(0);
    expect(migrated.graph.edges.filter(edge => edge.target === 'statusB' && edge.targetHandle === 'data:entity')).toHaveLength(0);
    expect(migrated.processNodes['effect:statusA']).toMatchObject({ trigger: { mode: 'manual' }, entryTriggerId: 'effect:statusA' });
    expect(migrated.processNodes['effect:statusB']).toMatchObject({ trigger: { mode: 'manual' }, entryTriggerId: 'effect:statusB' });
  });

  it('is idempotent after migration', () => {
    const definition = {
      dataflowVersion: 3,
      processNodes: { source: { id: 'source', kind: 'source.literalItem', value: 1, type: { base: 'number', shape: 'item' } } },
      graph: { nodes: [{ id: 'source', type: 'processNode' }], edges: [] }
    };
    expect(migrateProcessDataflowDefinition(definition)).toEqual({ changed: false, value: definition });
  });

  it('replaces v3 draft composition with a typed block composer', () => {
    const definition = {
      dataflowVersion: 3,
      processNodes: {
        name: { id: 'name', kind: 'source.literalItem', value: 'Project', type: { base: 'string', shape: 'item' } },
        draft: {
          id: 'draft',
          kind: 'record.entityDraft',
          entityType: 'project',
          fields: ['identity.name'],
          fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
        },
        create: { id: 'create', kind: 'effect.createEntity', entityType: 'project' }
      },
      graph: {
        nodes: ['name', 'draft', 'create'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'name-draft', source: 'name', sourceHandle: 'data:value', target: 'draft', targetHandle: 'data:identity.name', role: 'data' },
          { id: 'draft-create', source: 'draft', sourceHandle: 'data:record', target: 'create', targetHandle: 'data:draft', role: 'data' }
        ]
      }
    };

    const migrated = migrateProcessDataflowDefinition(definition).value;
    expect(migrated.processNodes.draft).toBeUndefined();
    expect(migrated.processNodes.create).toMatchObject({ fields: [], blocks: ['identity'] });
    const identityComposer = Object.values(migrated.processNodes)
      .find(node => node.kind === 'record.composeBlock' && node.block === 'identity');
    expect(identityComposer).toMatchObject({ fields: ['identity.name'] });
    expect(migrated.graph.edges).toContainEqual(expect.objectContaining({
      source: 'name',
      targetHandle: 'data:identity.name'
    }));
    expect(migrated.graph.edges).toContainEqual(expect.objectContaining({
      sourceHandle: 'data:block',
      target: 'create',
      targetHandle: 'data:identity'
    }));
  });

  it('migrates domain constructors out of generic create effects into producer services', () => {
    const definition = {
      dataflowVersion: 3,
      processNodes: {
        create: {
          id: 'create',
          kind: 'effect.createEntity',
          entityType: 'cassette_design',
          construction: {
            mode: 'bakeCassetteDesignFromTemplate',
            inputs: [{ id: 'templateId', path: 'templateId', type: 'entity', entityType: 'cassette', required: true }]
          },
          trigger: { mode: 'manual' }
        }
      },
      graph: {
        nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
        edges: []
      }
    };

    const migrated = migrateProcessDataflowDefinition(definition, cncDomain).value;

    expect(migrated.processNodes.create).toMatchObject({
      kind: 'effect.runProducer',
      producerId: 'bakeCassetteDesignFromTemplate',
      entityType: 'cassette_design',
      construction: { mode: 'bakeCassetteDesignFromTemplate' }
    });
  });

  it('stops on ambiguous hybrid direct and composed field wiring', () => {
    expect(() => migrateProcessDataflowDefinition({
      dataflowVersion: 3,
      processNodes: {
        name: { id: 'name', kind: 'source.literalItem', type: { base: 'string' }, value: 'Direct' },
        legacyName: { id: 'legacyName', kind: 'source.literalItem', type: { base: 'string' }, value: 'Legacy' },
        draft: { id: 'draft', kind: 'record.entityDraft', entityType: 'queue', fields: ['identity.name'] },
        create: { id: 'create', kind: 'effect.createEntity', entityType: 'queue', fields: ['identity.name'] }
      },
      graph: {
        nodes: ['name', 'legacyName', 'draft', 'create'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'legacy-name-draft', source: 'legacyName', sourceHandle: 'data:value', target: 'draft', targetHandle: 'data:identity.name', role: 'data' },
          { id: 'draft-create', source: 'draft', sourceHandle: 'data:record', target: 'create', targetHandle: 'data:draft', role: 'data' },
          { id: 'name-create', source: 'name', sourceHandle: 'data:value', target: 'create', targetHandle: 'data:identity.name', role: 'data' }
        ]
      }
    }, cncDomain)).toThrow(/wired both directly and through legacy composition/);
  });

  it('migrates every starter template into an activatable v3 graph', () => {
    for (const template of Object.values(PROCESS_TEMPLATES)) {
      const source = createProcessFromTemplate({
        templateId: template.id,
        organizationId: 'organization',
        userId: 'user'
      });
      const migrated = migrateProcessDataflowDefinition(source.data, cncDomain).value;
      expect(migrated.dataflowVersion, template.id).toBe(3);
      expect(validateProcessDefinition(migrated, cncDomain).errors, template.id).toEqual([]);
    }
  });
});
