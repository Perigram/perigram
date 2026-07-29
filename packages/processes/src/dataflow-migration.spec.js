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
      fields: ['identity.name']
    });
    expect(result.value.processNodes['trigger:update']).toMatchObject({
      kind: 'control.manualTrigger',
      entityType: 'queue'
    });
    expect(result.value.processNodes['current:entity:update']).toBeUndefined();
    expect(result.value.processNodes['ref:entity:update']).toBeUndefined();
    expect(result.value.processNodes['effect:update'].entryTriggerId).toBe('trigger:update');
    expect(result.value.graph.nodes.every(node => node.type === 'processNode')).toBe(true);
    expect(result.value.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'name', sourceHandle: 'data:value', target: 'update', targetHandle: 'data:identity.name', role: 'data' }),
      expect.objectContaining({ source: 'trigger:update', sourceHandle: 'data:payload', target: 'update', targetHandle: 'data:entity', role: 'data' })
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
    expect(migrated.graph.edges.filter(edge => edge.target === 'statusA' && edge.targetHandle === 'data:entity')).toHaveLength(1);
    expect(migrated.graph.edges.filter(edge => edge.target === 'statusB' && edge.targetHandle === 'data:entity')).toHaveLength(1);
  });

  it('is idempotent after migration', () => {
    const definition = {
      dataflowVersion: 3,
      processNodes: { source: { id: 'source', kind: 'source.literalItem', value: 1, type: { base: 'number', shape: 'item' } } },
      graph: { nodes: [{ id: 'source', type: 'processNode' }], edges: [] }
    };
    expect(migrateProcessDataflowDefinition(definition)).toEqual({ changed: false, value: definition });
  });

  it('replaces v3 draft composition with direct create field sockets', () => {
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
    expect(migrated.processNodes.create.fields).toEqual(['identity.name']);
    expect(migrated.graph.edges).toContainEqual(expect.objectContaining({
      source: 'name',
      target: 'create',
      targetHandle: 'data:identity.name'
    }));
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
