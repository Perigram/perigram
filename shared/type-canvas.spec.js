// Type-canvas projection (SPEC §20/§21): declarations project to
// nodes/wires for the read-only registry browser. Authoring compiles from
// the process designer tree (compileTreeDeclarations in
// packages/processes), not from this canvas — there is no compile-back here
// by design.
import { describe, it, expect } from 'vitest';
import { canvasFromDeclarations } from '../composables/useTypeCanvas.js';

const widget = {
  id: 'widget',
  class: 'process',
  scope: 'org',
  organizationId: 'org-1',
  version: 2,
  fields: {
    name: { base: 'string' },
    width: { base: 'quantity', unit: 'mm' }
  },
  states: { main: { initial: 'raw', values: ['raw', 'done'], terminal: ['done'] } },
  transitions: [
    { from: 'raw', to: 'done', intent: 'finish' },
    { from: 'raw', to: 'raw' }
  ],
  edges: { children: { parts: { types: ['gadget'], onRemove: 'restrict' } } },
  payload: { mime: 'application/x-widget' },
  render: { label: 'Widget' }
};

const system = {
  id: 'cassette',
  class: 'file',
  scope: 'system',
  version: 1,
  fields: { name: { base: 'string' } },
  payload: { mime: 'application/perigram+occs' }
};

describe('type canvas projection', () => {
  it('projects declarations to type/field/state nodes with declares and transition wires', () => {
    const canvas = canvasFromDeclarations([widget, system]);
    const typeIds = canvas.nodes.filter(node => node.type === 'typeNode').map(node => node.data.typeId);
    expect(typeIds).toEqual(['cassette', 'widget']); // class columns: file before process
    expect(canvas.nodes.filter(node => node.type === 'fieldNode' && node.data.typeId === 'widget')).toHaveLength(2);
    const stateNodes = canvas.nodes.filter(node => node.type === 'stateNode' && node.data.typeId === 'widget');
    expect(stateNodes.map(node => node.data.value)).toEqual(['raw', 'done']);
    expect(stateNodes.find(node => node.data.value === 'raw').data.initial).toBe(true);
    expect(canvas.edges.filter(edge => edge.role === 'declares')).toHaveLength(5);
    const transitions = canvas.edges.filter(edge => edge.role === 'transition');
    expect(transitions).toHaveLength(2);
    expect(transitions.find(edge => edge.data.intent === 'finish')).toMatchObject({
      source: 'state:widget:raw',
      target: 'state:widget:done'
    });
    expect(canvas.edges.filter(edge => edge.role === 'children')).toContainEqual(
      expect.objectContaining({ source: 'type:widget', target: 'type:gadget', data: { key: 'parts' } })
    );
  });
});
