// Crystallization Phase 4 — inference owns default stations. The detector
// flags authored screens that are projection-equal to the station
// inferScreensFromRoleGrants would emit; validation blocks Apply on hits.
import { describe, expect, it } from 'vitest';
import { compileProcessDefinition, redundantAuthoredScreens, validateProcessDefinition } from './index.js';

const domain = {
  entities: [
    { type: 'queue' },
    { type: 'project' }
  ],
  commands: {},
  summaries: [],
  containment: [
    { childType: 'queue', parentType: 'project', lineageKey: 'projectId' }
  ]
};

function baseProcess() {
  return {
    roles: {
      role_operator: { id: 'role_operator', label: 'Operator', grants: [{ feature: 'queues', level: 'write' }] }
    },
    producerOutputs: {
      'queue_profile:entity': {
        id: 'queue_profile:entity',
        producerOutputId: 'queue_profile:entity',
        nodeId: 'queue_profile',
        outputSocketId: 'entity',
        typeId: 'queue',
        lifecycle: { mode: 'defaultCreated' },
        fields: { read: [], write: [], private: [] }
      }
    },
    graph: { nodes: [], edges: [] },
    actions: {
      action_accept: {
        id: 'action_accept',
        label: 'Accept',
        actionKind: 'updateEntity',
        typeId: 'queue',
        producerOutputId: 'queue_profile:entity',
        state: { to: 'NEXT_STATUS' },
        access: { roleIds: ['role_operator'], level: 'write' }
      }
    },
    assignments: {}
  };
}

function inferredStationProjection() {
  // An authored copy of the exact default station inference emits for
  // (role_operator, queue) — derived from the compiled output so the
  // fixture cannot drift from the inference shape. The authored id and
  // route differ (authored screens require a route); neither field
  // participates in equivalence.
  const base = baseProcess();
  const compiled = compileProcessDefinition(base, domain, {
    roles: { role_operator: { id: 'role_operator' } }
  });
  const { labelKey, route, sourceRoute, scope, bindings, ...station } = compiled.screens.auto_role_operator_queue;
  return { ...station, id: 'queue_list_hand', route: '/screens/queue_list_hand' };
}

describe('redundantAuthoredScreens', () => {
  it('reports an authored screen that matches the inferred station projection', () => {
    const process = { ...baseProcess(), screens: { queue_list_hand: inferredStationProjection() } };
    const hits = redundantAuthoredScreens(process, domain, compiledRolesFor(process));
    expect(hits).toEqual([
      { id: 'queue_list_hand', roleId: 'role_operator', typeId: 'queue', template: 'typeList' }
    ]);
  });

  it('validation blocks the redundant screen with the inference-owned message', () => {
    const process = { ...baseProcess(), screens: { queue_list_hand: inferredStationProjection() } };
    const validation = validateProcessDefinition(process, domain, {
      roles: { role_operator: { id: 'role_operator' } }
    });
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('; ')).toMatch(/queue_list_hand duplicates the inferred station for role role_operator/);
  });

  it('keeps a customized station (label deviation)', () => {
    const customized = { ...inferredStationProjection(), label: 'Cutting queues' };
    const process = { ...baseProcess(), screens: { queue_list_hand: customized } };
    expect(redundantAuthoredScreens(process, domain, compiledRolesFor(process))).toEqual([]);
    const validation = validateProcessDefinition(process, domain, {
      roles: { role_operator: { id: 'role_operator' } }
    });
    expect(validation.errors.join('; ')).not.toMatch(/duplicates the inferred station/);
  });

  it('returns nothing with no authored screens and compiles cleanly', () => {
    const process = baseProcess();
    expect(redundantAuthoredScreens(process, domain, compiledRolesFor(process))).toEqual([]);
    const compiled = compileProcessDefinition(process, domain, { roles: { role_operator: { id: 'role_operator' } } });
    expect(compiled.screens.auto_role_operator_queue).toMatchObject({ typeId: 'queue' });
  });
});

function compiledRolesFor(process) {
  const compiled = compileProcessDefinition(
    { ...process, screens: {} },
    domain,
    { roles: Object.fromEntries(Object.keys(process.roles || {}).map(id => [id, { id }])) }
  );
  return compiled.roles;
}
