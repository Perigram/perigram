import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  definitionToCanvas,
  normalizeProcessDefinition,
  PROCESS_DATAFLOW_VERSION
} from './index.js';
import { createTemplate } from './test-support.js';

const SYNTHETIC_TEMPLATES = [
  createTemplate({
    id: 'synthetic-a',
    label: 'Synthetic A process',
    adminLabel: 'A admin',
    grants: { widgets: 'admin', gadgets: 'read' },
    entities: {
      widget: {
        id: 'widget',
        typeId: 'widget',
        label: 'Widget',
        lifecycle: { mode: 'domainDefault', workflow: null },
        fields: { read: ['name'], write: [], private: [] },
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
        create: { id: 'create', kind: 'effect.createEntity', typeId: 'project' }
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
    // Actions are panel-owned definition records: the canvas never projects
    // or deletes them.
    expect(canvasToDefinition(canvas, definition).actions).toEqual(definition.actions);
  });

  it('preserves valid graph nodes, viewport, and edges across Save and reload round trips', () => {
    const processNode = { id: 'p1', kind: 'source.literalItem', fields: [] };
    const processData = {
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      roleGrants: {},
      processNodes: { p1: processNode },
      entityProfiles: {}
    };
    const graph = {
      nodes: [
        { id: 'n1', type: 'processNode', position: { x: 100, y: 200 }, data: { refId: 'p1', label: 'Node 1' } },
        { id: 'n2', type: 'processNode', position: { x: 300, y: 400 }, data: { refId: 'p1', label: 'Node 2', selected: true } }
      ],
      edges: [],
      viewport: { x: 50, y: 60, zoom: 1.5 }
    };

    const saveSnapshot = canvasToDefinition(graph, processData);
    expect(saveSnapshot.graph.nodes.length).toBe(2);
    expect(saveSnapshot.graph.viewport).toEqual({ x: 50, y: 60, zoom: 1.5 });
    const selectedNode = saveSnapshot.graph.nodes.find(n => n.id === 'n2');
    expect(selectedNode.data.selected).toBe(true);

    const reloadedCanvas = definitionToCanvas(saveSnapshot);
    expect(reloadedCanvas.nodes.length).toBe(2);
    expect(reloadedCanvas.viewport).toEqual({ x: 50, y: 60, zoom: 1.5 });

    const resave = canvasToDefinition(reloadedCanvas, saveSnapshot);
    expect(resave.graph.nodes.length).toBe(2);
    expect(resave.graph.viewport).toEqual({ x: 50, y: 60, zoom: 1.5 });
  });

  it('survives Save with an empty graph after validation errors', () => {
    const emptyData = { dataflowVersion: PROCESS_DATAFLOW_VERSION, processNodes: {}, roleGrants: {}, entityProfiles: {} };
    const graph = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };

    const snapshot = canvasToDefinition(graph, emptyData);
    expect(snapshot.graph.nodes.length).toBe(0);
    expect(snapshot.graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });

    const roundTrip = canvasToDefinition(definitionToCanvas(snapshot), snapshot);
    expect(roundTrip.graph.nodes.length).toBe(0);
    expect(roundTrip.graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
