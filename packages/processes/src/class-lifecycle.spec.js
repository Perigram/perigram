// Class lifecycle panel contract: classLifecycleOf derives the selected
// class's states from the same declaration tree the canvas renders —
// states are the ctsState nodes declaring on the class, nesting their
// state-to-state wires. Terminal is authored on the node; initial state
// is not a state property (SPEC §7): it is the construct's state socket.
// The panel edits through those nodes/edges, so panel authoring and tree
// authoring are one data model.
import { describe, expect, it } from 'vitest';
import { classLifecycleOf } from './designer.js';

const classNode = { id: 'cls', type: 'ctsClass', data: { refId: 'cls', typeId: 'widget', class: 'item' } };
const edge = (id, source, target, extra = {}) => ({ id, source, target, role: 'type', ...extra });
const state = (id, value, extra = {}) => ({ id, type: 'ctsState', data: { refId: id, typeId: null, value, terminal: false, ...extra } });

describe('classLifecycleOf', () => {
  it('collects states with authored render overrides and terminal flags', () => {
    const nodes = [classNode, state('s1', 'draft', { severity: 'info', terminal: true }), state('s2', 'done', { severity: 'success', icon: 'pi pi-check-circle' })];
    const edges = [
      { id: 'd1', source: 's1', target: 'cls', role: 'type', label: 'state' },
      { id: 'd2', source: 's2', target: 'cls', role: 'type', label: 'state' }
    ];
    const lifecycle = classLifecycleOf(nodes, edges, 'cls');
    expect(lifecycle.states).toEqual([
      { nodeId: 's1', value: 'draft', severity: 'info', icon: null, terminal: true },
      { nodeId: 's2', value: 'done', severity: 'success', icon: 'pi pi-check-circle', terminal: false }
    ]);
    expect(lifecycle.nesting).toEqual([]);
  });

  it('collects nesting parents from state-to-state wires', () => {
    const nodes = [classNode, state('s1', 'draft'), state('s2', 'done')];
    const edges = [
      edge('d1', 's1', 'cls'), edge('d2', 's2', 'cls'),
      edge('t1', 's1', 's2')
    ];
    const lifecycle = classLifecycleOf(nodes, edges, 'cls');
    expect(lifecycle.nesting).toEqual([
      { edgeId: 't1', parent: 'draft', child: 'done' }
    ]);
  });

  it('is empty for a class without states', () => {
    expect(classLifecycleOf([classNode], [], 'cls')).toEqual({ states: [], nesting: [] });
  });
});
