// Declaration-wire round trip: the edge label is the wire's declaration
// semantics (field/state/nesting/children/ref-target; nesting
// intents). compileTreeDeclarations matches partners BY LABEL, so a label
// lost in canvasToDefinition hollows out the declaration tree after reload
// — constructs lose their row-field sockets and their wires get filtered
// as missing inputs at the next save. This pins the full loop:
// canvas -> definition -> canvas preserves labels, and the compiled tree
// still declares the wired fields/states/nesting/children after it.
import { describe, expect, it } from 'vitest';
import { canvasToDefinition, definitionToCanvas } from './transpiler.js';
import { compileTreeDeclarations } from './designer.js';

function declarationCanvas() {
  const classNode = type => ({
    id: `${type}-class`,
    type: 'ctsClass',
    position: { x: 0, y: 0 },
    data: { refId: `${type}-class`, typeId: type, class: 'item', scope: 'tree', label: '', payload: null, fields: 0, states: 0 }
  });
  return {
    nodes: [
      classNode('widget'),
      classNode('gadget'),
      { id: 'name-field', type: 'ctsField', position: { x: 0, y: 120 }, data: { refId: 'name-field', typeId: 'widget', name: 'name', descriptor: { base: 'string' } } },
      { id: 'ready-state', type: 'ctsState', position: { x: 0, y: 240 }, data: { refId: 'ready-state', typeId: 'widget', value: 'ready', severity: 'info', icon: 'pi pi-play-circle' } },
      { id: 'done-state', type: 'ctsState', position: { x: 0, y: 360 }, data: { refId: 'done-state', typeId: 'widget', value: 'done', severity: 'success', icon: 'pi pi-check-circle' } },
      { id: 'make-widget', type: 'processNode', position: { x: 240, y: 120 }, data: { refId: 'make-widget', typeId: 'widget' } }
    ],
    edges: [
      { id: 'declares:name-field-widget-class', source: 'name-field', target: 'widget-class', targetHandle: 'input:declare', sourceHandle: 'output:field', type: 'default', role: 'type', label: 'field' },
      { id: 'declares:ready-state-widget-class', source: 'ready-state', target: 'widget-class', targetHandle: 'input:declare', sourceHandle: 'output:state', type: 'default', role: 'type', label: 'state' },
      { id: 'declares:done-state-widget-class', source: 'done-state', target: 'widget-class', targetHandle: 'input:declare', sourceHandle: 'output:state', type: 'default', role: 'type', label: 'state' },
      { id: 'entry:ready-state-make-widget-1', source: 'ready-state', target: 'make-widget', type: 'default', role: 'type', label: 'entry' },
      { id: 'nested:done-state-ready-state-1', source: 'done-state', target: 'ready-state', type: 'default', role: 'type', label: 'nested' },
      { id: 'children:widget-class-gadget-class', source: 'widget-class', target: 'gadget-class', type: 'default', role: 'type', label: 'children', data: { key: 'gadgets', onRemove: 'restrict' } }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

describe('declaration wire labels round-trip', () => {
  it('canvasToDefinition -> definitionToCanvas preserves every declaration label', () => {
    const canvas = declarationCanvas();
    const definition = canvasToDefinition(canvas, { dataflowVersion: 4 });
    const reloaded = definitionToCanvas(definition);

    const labels = new Map(reloaded.edges.map(edge => [edge.id, edge.label]));
    expect(labels.get('declares:name-field-widget-class')).toBe('field');
    expect(labels.get('declares:ready-state-widget-class')).toBe('state');
    expect(labels.get('declares:done-state-widget-class')).toBe('state');
    expect(labels.get('entry:ready-state-make-widget-1')).toBe('entry');
    expect(labels.get('nested:done-state-ready-state-1')).toBe('nested');
    expect(labels.get('children:widget-class-gadget-class')).toBe('children');
    expect(reloaded.edges.find(edge => edge.id === 'children:widget-class-gadget-class')?.data).toMatchObject({ key: 'gadgets', onRemove: 'restrict' });
  });

  it('compileTreeDeclarations still declares the tree after the round trip', () => {
    const definition = canvasToDefinition(declarationCanvas(), { dataflowVersion: 4 });
    const reloaded = definitionToCanvas(definition);
    const { declarations, diagnostics } = compileTreeDeclarations(reloaded.nodes, reloaded.edges);

    expect(diagnostics).toEqual([]);
    const widget = declarations.find(declaration => declaration.id === 'widget');
    expect(widget.fields).toMatchObject({ name: { base: 'string' } });
    expect(widget.states.main.values).toEqual(['ready', 'ready.done']);
    // terminal derives from the transition-node machine; none declared
    expect(widget.states.main.terminal).toEqual(['ready', 'ready.done']);
    expect(widget.transitions).toEqual([]);
    expect(widget.edges.children.gadgets).toMatchObject({ types: ['gadget'], onRemove: 'restrict' });
  });
});
