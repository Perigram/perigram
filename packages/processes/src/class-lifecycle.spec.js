// Class lifecycle panel contract: classLifecycleOf derives the selected
// class's states and transitions from the same declaration tree the canvas
// renders — states are the ctsState nodes declaring on the class,
// transitions their state-to-state wires with intents. The panel edits
// through those nodes/edges, so panel authoring and tree authoring are one
// data model.
import { describe, expect, it } from 'vitest';
import { classLifecycleOf } from './designer.js';

const classNode = { id: 'cls', type: 'ctsClass', data: { refId: 'cls', typeId: 'widget', class: 'item' } };
const state = (id, value, extra = {}) => ({ id, type: 'ctsState', data: { refId: id, typeId: null, value, initial: false, terminal: false, ...extra } });

describe('classLifecycleOf', () => {
  it('collects the states declaring on the class and ignores foreign ones', () => {
    const nodes = [classNode, state('s1', 'draft', { initial: true }), state('s2', 'done', { terminal: true }), state('s9', 'other')];
    const edges = [
      { id: 'd1', source: 's1', target: 'cls', role: 'type', label: 'state' },
      { id: 'd2', source: 's2', target: 'cls', role: 'type', label: 'state' }
    ];
    const lifecycle = classLifecycleOf(nodes, edges, 'cls');
    expect(lifecycle.states).toEqual([
      { nodeId: 's1', value: 'draft', initial: true, terminal: false },
      { nodeId: 's2', value: 'done', initial: false, terminal: true }
    ]);
    expect(lifecycle.transitions).toEqual([]);
  });

  it('collects transitions between the class states with intents', () => {
    const nodes = [classNode, state('s1', 'draft'), state('s2', 'done')];
    const edges = [
      { id: 'd1', source: 's1', target: 'cls', role: 'type', label: 'state' },
      { id: 'd2', source: 's2', target: 'cls', role: 'type', label: 'state' },
      { id: 't1', source: 's1', target: 's2', role: 'type', label: 'finish', data: { intent: 'finish' } },
      { id: 't2', source: 's2', target: 's2', role: 'type' } // loop: done -> done
    ];
    const lifecycle = classLifecycleOf(nodes, edges, 'cls');
    expect(lifecycle.transitions).toEqual([
      { edgeId: 't1', from: 'draft', to: 'done', intent: 'finish' },
      { edgeId: 't2', from: 'done', to: 'done', intent: '' }
    ]);
  });

  it('is empty for a class without states', () => {
    expect(classLifecycleOf([classNode], [], 'cls')).toEqual({ states: [], transitions: [] });
  });
});
