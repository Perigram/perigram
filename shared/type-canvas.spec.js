// Type-canvas projection round trip (SPEC §20/§21 slice B): declarations
// project to nodes/wires and compile back without losing structure; system
// types stay read-only; intents ride transition wires; children ride type
// wires.
import { describe, it, expect } from 'vitest';
import { canvasFromDeclarations, declarationsFromCanvas, suggestTypeId } from '../composables/useTypeCanvas.js';

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

  it('compiles the canvas back into declarations, preserving facets', () => {
    const canvas = canvasFromDeclarations([widget, system]);
    const { declarations, diagnostics } = declarationsFromCanvas(canvas, [widget, system]);
    expect(diagnostics).toEqual([]);
    expect(declarations).toHaveLength(1); // system types compile from packs, never from the canvas
    const [compiled] = declarations;
    expect(compiled.id).toBe('widget');
    expect(compiled.class).toBe('process');
    expect(compiled.scope).toBe('org');
    expect(compiled.fields).toEqual({
      name: { base: 'string' },
      width: { base: 'quantity', unit: 'mm' }
    });
    expect(compiled.states.main).toEqual({ initial: 'raw', values: ['raw', 'done'], terminal: ['done'] });
    expect(compiled.transitions).toEqual([
      { from: 'raw', to: 'done', intent: 'finish' },
      { from: 'raw', to: 'raw' }
    ]);
    expect(compiled.edges).toEqual({ children: { parts: { types: ['gadget'], onRemove: 'restrict' } } });
    expect(compiled.payload).toEqual({ mime: 'application/x-widget' });
    expect(compiled.render).toEqual({ label: 'Widget' });
  });

  it('new field/state nodes attach through wires; renaming is structural', () => {
    const canvas = canvasFromDeclarations([widget]);
    canvas.nodes.push({
      id: 'field:widget:note',
      type: 'fieldNode',
      position: { x: 0, y: 0 },
      data: { typeId: 'widget', name: 'note', descriptor: { base: 'string', nullable: true } }
    });
    canvas.edges.push({
      id: 'declares-field:field:widget:note',
      source: 'field:widget:note',
      target: 'type:widget',
      role: 'declares'
    });
    const { declarations } = declarationsFromCanvas(canvas, [widget]);
    expect(declarations[0].fields.note).toEqual({ base: 'string', nullable: true });
  });

  it('suggests unused kebab ids per class', () => {
    expect(suggestTypeId(['file-1', 'file-2'], 'file')).toBe('file-3');
  });
});
