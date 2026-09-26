import { describe, expect, it } from 'vitest';
import { checkCtsGraphBindings } from './graph-protocol.js';

const domain = { entities: [{ type: 'panel' }] };

function definition(processNodes = {}, ctsTypes = {}, edges = []) {
  return {
    data: {
      processNodes,
      ctsTypes,
      graph: { nodes: [], edges }
    }
  };
}

describe('transition target binding checks', () => {
  it('refuses an executable transition with no authored target', () => {
    const errors = checkCtsGraphBindings(definition({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel' }
    }), domain);

    expect(errors).toContain('processNodes.t1: transition declares no target state');
  });

  it('accepts a transition whose target comes from the inspector state reference', () => {
    const errors = checkCtsGraphBindings(definition({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', state: { axis: 'main', to: 'DONE' } }
    }, {
      s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'DONE' }
    }), domain);

    expect(errors).toEqual([]);
  });

  it('accepts a transition whose target arrives over a status wire', () => {
    const errors = checkCtsGraphBindings(definition({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel' }
    }, {
      s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'DONE' }
    }, [
      { id: 'e1', source: 's1', sourceHandle: 'data:value', target: 't1', targetHandle: 'data:status', role: 'data' }
    ]), domain);

    expect(errors.filter(error => error.includes('declares no target state'))).toEqual([]);
  });

  it('accepts a transition whose target comes from an authored default', () => {
    const errors = checkCtsGraphBindings(definition({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', inputDefaults: { state: 'DONE' } }
    }, {
      s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'DONE' }
    }), domain);

    expect(errors).toEqual([]);
  });

  it('keeps refusing a target the draft does not declare for the type', () => {
    const errors = checkCtsGraphBindings(definition({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', state: { axis: 'main', to: 'MYSTERY' } }
    }, {
      s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'DONE' }
    }), domain);

    expect(errors).toContain('processNodes.t1: state MYSTERY is not declared for panel');
  });
});
