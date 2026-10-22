// Per-state field policy (CTS SPEC §7 `fieldPolicy`, §10): authored on
// the typed operations — a transition declares its target state's facet,
// a construct its initial state's — normalized in one home, row-checked
// at the declaration-check seam, and compiled onto workflow states with
// first-declaration ownership.
import { describe, expect, it } from 'vitest';
import { createTypeRegistry, projectDomainFromView } from '../../cts/src/index.js';
import { normalizeStateFieldPolicy } from './designer.js';
import { compileProcessDefinition } from './compiler-core.js';

describe('normalizeStateFieldPolicy', () => {
  it('keeps authored lists (empty list included) and drops everything else', () => {
    expect(normalizeStateFieldPolicy({ visible: ['a', 'a', 'b'], editable: [] }))
      .toEqual({ visible: ['a', 'b'], editable: [] });
    expect(normalizeStateFieldPolicy({ visible: 'yes' })).toBeNull();
    expect(normalizeStateFieldPolicy({})).toBeNull();
    expect(normalizeStateFieldPolicy(null)).toBeNull();
  });

  it('adopts row-relative ids (a block-prefixed spelling is the bare row id)', () => {
    expect(normalizeStateFieldPolicy({ visible: ['fields.total', 'width'], editable: ['fields.total'] }))
      .toEqual({ visible: ['total', 'width'], editable: ['total'] });
  });
});

describe('operation-carried field policy compilation', () => {
  function compiledWith(processNodes, createFieldPolicy = null) {
    const registry = createTypeRegistry();
    registry.defineType({
      id: 'panel', class: 'item', name: 'Panel',
      fields: { serial: { base: 'string' }, width: { base: 'quantity', unit: 'mm' } }
    });
    const domain = projectDomainFromView(registry, 'org-facet');
    return compileProcessDefinition({
      graphProtocol: 5,
      dataflowVersion: 4,
      graph: {
        nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
        edges: []
      },
      roleGrants: {},
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'panel', value: 'available' },
        s2: { id: 's2', kind: 'state', typeId: 'panel', value: 'escalated' },
        s3: { id: 's3', kind: 'state', typeId: 'panel', value: 'quarantined' }
      },
      processNodes: {
        create: {
          id: 'create', kind: 'cts.construct', typeId: 'panel',
          producerOutputId: 'create:result',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          inputDefaults: { state: 'available' },
          ...(createFieldPolicy ? { fieldPolicy: createFieldPolicy } : {})
        },
        ...processNodes
      },
      producerOutputs: {
        'create:result': {
          producerOutputId: 'create:result', nodeId: 'create', outputSocketId: 'result',
          typeId: 'panel', lifecycle: { mode: 'domainDefault' },
          fields: { read: ['fields.serial', 'fields.width'], write: [], private: [] }
        }
      },
      actions: {}, services: {}, sockets: {}, screens: {}, stateDefinitions: {}, valueInputs: {}
    }, domain, {});
  }

  it('rides the transition target and the construct initial state', () => {
    const compiled = compiledWith({
      toEscalated: { id: 'toEscalated', kind: 'cts.transition', typeId: 'panel', state: { to: 'escalated' }, fieldPolicy: { editable: ['serial'] } },
      other: { id: 'other', kind: 'cts.transition', typeId: 'panel', state: { to: 'quarantined' } }
    });
    const states = compiled.producerOutputs['create:result'].workflow.states;
    expect(states.escalated.fieldPolicy).toEqual({ editable: ['serial'] });
    expect(states.quarantined.fieldPolicy).toBeUndefined();
  });

  it('the construct initial state carries its facet; first declaration of a state wins', () => {
    const compiled = compiledWith({
      reEntry: { id: 'reEntry', kind: 'cts.transition', typeId: 'panel', state: { to: 'available' }, fieldPolicy: { visible: ['width'] } }
    }, { visible: ['serial'] });
    const states = compiled.producerOutputs['create:result'].workflow.states;
    expect(states.available.fieldPolicy).toEqual({ visible: ['serial'] });
  });
});
