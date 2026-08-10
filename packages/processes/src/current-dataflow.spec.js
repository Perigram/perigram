import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  createTemplate,
  definitionToCanvas,
  normalizeProcessDefinition,
  PROCESS_DATAFLOW_VERSION
} from './index.js';

const SYNTHETIC_TEMPLATES = [
  createTemplate({
    id: 'synthetic-a',
    label: 'Synthetic A process',
    adminLabel: 'A admin',
    grants: { widgets: 'admin', gadgets: 'read' },
    entities: {
      widget: {
        id: 'widget',
        entityType: 'widget',
        label: 'Widget',
        lifecycle: { mode: 'domainDefault', workflow: null },
        fields: { read: ['identity.*'], write: [], private: [] },
        stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
        allowedRoles: { read: ['role_admin'], write: ['role_admin'], admin: ['role_admin'] }
      }
    },
    services: {}
  }),
  createTemplate({
    id: 'synthetic-b',
    label: 'Synthetic B process',
    adminLabel: 'B admin',
    grants: { widgets: 'read' },
    entities: {},
    services: {}
  })
];

function createProcessFromTemplate({ templateId = '', organizationId }) {
  const template = SYNTHETIC_TEMPLATES.find(item => item.id === templateId) || SYNTHETIC_TEMPLATES[0];
  const definition = JSON.parse(JSON.stringify(template.definition));
  definition.compiled = null;
  return {
    identity: {
      uid: `process-${template.id}-${String(organizationId || 'org')}`,
      name: template.label,
      slug: template.id
    },
    lineage: { organizationId },
    data: definition
  };
}

describe('current process dataflow contract', () => {
  it('creates an empty canvas directly in the current format', () => {
    const definition = canvasToDefinition(
      { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { dataflowVersion: PROCESS_DATAFLOW_VERSION }
    );

    expect(definition.dataflowVersion).toBe(PROCESS_DATAFLOW_VERSION);
    expect(definition.graph.nodes).toEqual([]);
    expect(definition.processNodes).toEqual({});
  });

  it('does not infer a dataflow version for unversioned input', () => {
    expect(normalizeProcessDefinition({ graph: { nodes: [], edges: [] } }).dataflowVersion).toBeUndefined();
  });

  it('authors every starter template directly in the current format', () => {
    for (const template of SYNTHETIC_TEMPLATES) {
      const process = createProcessFromTemplate({
        templateId: template.id,
        organizationId: 'organization'
      });
      expect(process.data.dataflowVersion, template.id).toBe(PROCESS_DATAFLOW_VERSION);
    }
  });

  it('does not project derived actions as duplicate canvas nodes', () => {
    const definition = {
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      actions: {
        create: { id: 'create', actionKind: 'createEntity', label: 'Create entity' }
      },
      processNodes: {
        create: { id: 'create', kind: 'effect.createEntity', entityType: 'project' }
      },
      graph: {
        nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    };

    const canvas = definitionToCanvas(definition);
    expect(canvas.nodes).toEqual([
      expect.objectContaining({ id: 'create', type: 'processNode', data: expect.objectContaining({ refId: 'create' }) })
    ]);
    expect(canvasToDefinition(canvas, definition).actions).toEqual({});
  });
});
