import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  createProcessFromTemplate,
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
});
