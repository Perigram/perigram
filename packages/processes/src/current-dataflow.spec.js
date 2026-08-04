import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  createProcessFromTemplate,
  definitionToCanvas,
  normalizeProcessDefinition,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_TEMPLATES
} from './index.js';

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
    for (const template of Object.values(PROCESS_TEMPLATES)) {
      const process = createProcessFromTemplate({
        templateId: template.id,
        organizationId: 'organization',
        userId: 'user'
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
