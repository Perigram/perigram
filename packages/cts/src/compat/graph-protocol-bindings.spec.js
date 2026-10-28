import { describe, expect, it } from 'vitest';
import { checkCtsGraphBindings, resolveCtsDefinition } from './graph-protocol.js';

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

  it('keeps refusing a target the draft does not declare', () => {
    const errors = checkCtsGraphBindings(definition({
      t1: { id: 't1', kind: 'cts.transition', typeId: 'panel', state: { axis: 'main', to: 'MYSTERY' } }
    }, {
      s1: { id: 's1', kind: 'state', value: 'DONE' }
    }), domain);

    expect(errors).toContain('processNodes.t1: state MYSTERY is not declared in this draft');
  });
});

describe('retired Name-input surgery (one-way rewrite at the resolution seam)', () => {
  const draftWithRetiredAuthoring = () => definition({
    c1: {
      id: 'c1',
      kind: 'cts.construct',
      typeId: 'panel',
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true },
          { id: 'data.note', path: 'data.note', type: 'string' }
        ]
      },
      inputDefaults: { name: 'Authored name', 'data.note': 'kept' }
    }
  }, {}, [
    { id: 'e-name', source: 'lit1', sourceHandle: 'data:value', target: 'c1', targetHandle: 'data:name', role: 'data' },
    { id: 'e-note', source: 'lit2', sourceHandle: 'data:value', target: 'c1', targetHandle: 'data:data.note', role: 'data' }
  ]);

  it('drops the retired input, its default, and edges wired into data:name', () => {
    const { definition: resolved } = resolveCtsDefinition(draftWithRetiredAuthoring(), domain);
    const construct = resolved.data.processNodes.c1;
    expect(construct.construction.inputs.map(input => input.id)).toEqual(['fields.note']);
    expect(construct.inputDefaults).toEqual({ 'fields.note': 'kept' });
    expect(resolved.data.graph.edges.map(edge => edge.id)).toEqual(['e-note']);
  });

  it('heals the edge diagnostic the retired socket produced', () => {
    // Before the surgery this draft fails validation with
    // "Edge e-name references missing input data:name on c1".
    const { definition: resolved } = resolveCtsDefinition(draftWithRetiredAuthoring(), domain);
    const errors = checkCtsGraphBindings(resolved, domain);
    expect(errors.filter(error => error.includes('references missing input'))).toEqual([]);
  });

  it('leaves name edges on non-construct targets alone', () => {
    const { definition: resolved } = resolveCtsDefinition(definition({
      m1: { id: 'm1', kind: 'cts.mutate', typeId: 'panel' }
    }, {}, [
      { id: 'e-keep', source: 'lit1', sourceHandle: 'data:value', target: 'm1', targetHandle: 'data:identity.name', role: 'data' }
    ]), domain);
    expect(resolved.data.graph.edges.map(edge => edge.id)).toEqual(['e-keep']);
  });
});
