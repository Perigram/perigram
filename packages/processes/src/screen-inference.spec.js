// Crystallization Phase 4 — inference owns default stations. The detector
// flags authored screens that are projection-equal to the station
// inferScreensFromRoleGrants would emit; validation blocks Apply on hits.
import { describe, expect, it } from 'vitest';
import { compileProcessDefinition, compileScreens, redundantAuthoredScreens, validateProcessDefinition } from './index.js';

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

// An authored copy of the exact default station inference emits for
// (role_operator, queue) — derived from the compiled output so the
// fixture cannot drift from the inference shape. The authored id and
// route differ (authored screens require a route); neither field
// participates in equivalence.
function stationCopyOf(stationId, id) {
  const base = baseProcess();
  const compiled = compileProcessDefinition(base, domain, {
    roles: { role_operator: { id: 'role_operator' } }
  });
  const { labelKey, route, sourceRoute, scope, bindings, ...station } = compiled.screens[stationId];
  return { ...station, id, route: `/screens/${id}` };
}

function inferredStationProjection() {
  return stationCopyOf('auto_role_operator_queue', 'queue_list_hand');
}

describe('redundantAuthoredScreens', () => {
  it('reports an authored screen that matches the inferred station projection', () => {
    const process = { ...baseProcess(), screens: { queue_list_hand: inferredStationProjection() } };
    const hits = redundantAuthoredScreens(process, domain, compiledRolesFor(process));
    expect(hits).toEqual([
      { id: 'queue_list_hand', roleId: 'role_operator', typeId: 'queue', template: 'typeList' }
    ]);
  });

  it('still flags the duplicate after JSON persistence drops unset-condition keys', () => {
    // Every stored definition round-trips through JSON, which deletes the
    // inference aggregation's undefined `rule`/`scope`/`transitions` keys —
    // null-valued and absent entries are the same projection.
    const persisted = JSON.parse(JSON.stringify(inferredStationProjection()));
    const process = { ...baseProcess(), screens: { queue_list_hand: persisted } };
    expect(redundantAuthoredScreens(process, domain, compiledRolesFor(process))).toEqual([
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

// Suppression is per station kind: an authored station is a delta that
// customizes exactly the one inferred station it equals in kind, while any
// other authored template for the feature stands in for both stations.
describe('station suppression granularity', () => {
  function stationsWith(authored) {
    const process = { ...baseProcess(), screens: authored };
    return compileScreens(process, domain, compiledRolesFor(process), []);
  }

  it('an authored typeList suppresses only the inferred list station', () => {
    const stations = stationsWith({ queue_list_hand: stationCopyOf('auto_role_operator_queue', 'queue_list_hand') });
    expect(stations.queue_list_hand).toMatchObject({ template: 'typeList', typeId: 'queue' });
    expect(stations.auto_role_operator_queue).toBeUndefined();
    expect(stations.auto_role_operator_queue_detail).toMatchObject({ template: 'instanceDetail', typeId: 'queue' });
  });

  it('an authored instanceDetail suppresses only the inferred detail station', () => {
    const stations = stationsWith({ queue_detail_hand: stationCopyOf('auto_role_operator_queue_detail', 'queue_detail_hand') });
    expect(stations.queue_detail_hand).toMatchObject({ template: 'instanceDetail', typeId: 'queue' });
    expect(stations.auto_role_operator_queue).toMatchObject({ template: 'typeList', typeId: 'queue' });
    expect(stations.auto_role_operator_queue_detail).toBeUndefined();
  });

  it('a non-station authored screen still suppresses both stations for its feature', () => {
    // The grant-derived feature for type queue is "queue" — an authored
    // chrome screen keyed to that feature stands in for both stations.
    const chrome = {
      id: 'queue_chrome',
      kind: 'route',
      template: 'route',
      label: 'Queues',
      route: '/queues',
      roleIds: ['role_operator'],
      required: { feature: 'queue' }
    };
    const stations = stationsWith({ queue_chrome: chrome });
    expect(stations.queue_chrome).toMatchObject({ template: 'route' });
    expect(stations.auto_role_operator_queue).toBeUndefined();
    expect(stations.auto_role_operator_queue_detail).toBeUndefined();
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
