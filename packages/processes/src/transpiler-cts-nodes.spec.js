import { describe, it, expect } from 'vitest';
import { definitionToCanvas, canvasToDefinition, validateRoundTrip } from './transpiler.js';

const definition = () => ({
  schemaVersion: 1,
  dataflowVersion: 4,
  graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  statusDefinitions: {
    st1: { id: 'st1', statusId: 'DRAFT', label: 'Draft' }
  },
  processNodes: {},
  producerOutputs: {},
  actions: {},
  services: {},
  sockets: {},
  valueInputs: {},
  roleGrants: {},
  servicePrincipals: {},
  screens: {}
});

describe('ctsType reference cards on the process canvas', () => {
  it('survive the canvas -> definition -> canvas round trip', () => {
    const canvas = {
      nodes: [
        { id: 'statusDefinition:st1', type: 'statusDefinition', position: { x: 0, y: 0 }, data: { refId: 'st1' } },
        { id: 'ctsType:widget', type: 'ctsType', position: { x: 400, y: 120 }, data: { refId: 'widget', typeId: 'widget' } }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    };
    const saved = canvasToDefinition(canvas, definition());
    expect(saved.graph.nodes.map(node => node.type)).toEqual(['statusDefinition', 'ctsType']);
    expect(saved.graph.nodes[1].data.typeId).toBe('widget');

    const back = definitionToCanvas(saved);
    const card = back.nodes.find(node => node.type === 'ctsType');
    expect(card?.data.typeId).toBe('widget');
    expect(back.nodes.some(node => node.type === 'statusDefinition')).toBe(true);
  });

  it('own no records: deleting the card keeps every definition record', () => {
    const withCard = canvasToDefinition({
      nodes: [
        { id: 'statusDefinition:st1', type: 'statusDefinition', position: { x: 0, y: 0 }, data: { refId: 'st1' } },
        { id: 'ctsType:widget', type: 'ctsType', position: { x: 400, y: 120 }, data: { refId: 'widget', typeId: 'widget' } }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }, definition());
    const withoutCard = canvasToDefinition({
      nodes: [{ id: 'statusDefinition:st1', type: 'statusDefinition', position: { x: 0, y: 0 }, data: { refId: 'st1' } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }, withCard);
    expect(withoutCard.statusDefinitions.st1).toBeTruthy();
    expect(withoutCard.graph.nodes.some(node => node.type === 'ctsType')).toBe(false);
  });

  it('definitions carrying reference cards still pass round-trip validation', () => {
    const withCard = canvasToDefinition({
      nodes: [
        { id: 'ctsType:widget', type: 'ctsType', position: { x: 100, y: 100 }, data: { refId: 'widget', typeId: 'widget' } }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }, definition());
    const result = validateRoundTrip(withCard);
    expect(result.ok).toBe(true);
  });
});
