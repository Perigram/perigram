import { describe, it, expect } from 'vitest';
import {
  resolveFieldControl,
  resolveSurface,
  resolvePreview,
  resolveActionButton,
  composeScreen,
  buildInstancePool,
  applyBudget,
  VARIANTS
} from '#shared/ui-mapping/index.js';
import {
  createUiMappingClientBundle,
  createUiMappingCompiledContract,
  createUiMappingInstances
} from './ui-mapping-fixtures.js';

const bundle = createUiMappingClientBundle();
const contract = createUiMappingCompiledContract();
const pool = buildInstancePool(createUiMappingInstances());

describe('screen composition over fixtures', () => {
  it('composes the probe detail screen with tabbed relation-scoped child regions', () => {
    const composed = composeScreen(contract.screens.auto_operator_probe_detail, contract, bundle, pool);
    expect(composed.template).toBe('entityDetail');
    const main = composed.regions[0];
    expect(main.surfaceKind).toBe('detail');
    expect(main.variant).toBe('full');
    expect(main.instances[0].id).toBe('probe-4');
    expect(main.actions.map(action => action.id)).toEqual([
      'probe_update', 'probe_launch', 'probe_retire', 'probe_delete', 'observation_link'
    ]);
    const childKinds = main.childRegions.map(child => `${child.entityType}:${child.instances.length}:${child.surfaceKind}`);
    expect(childKinds).toEqual([
      'observation:10:list',
      'spectrum:1:list',
      'log_entry:3:list'
    ]);
  });

  it('composes the constellation detail with lineage-scoped systems', () => {
    const composed = composeScreen(contract.screens.auto_operator_constellation_detail, contract, bundle, pool);
    const children = composed.regions[0].childRegions[0];
    expect(children.entityType).toBe('star_system');
    expect(children.instances).toHaveLength(3);
    expect(children.instances.every(system => system.lineage.systems?.id === 'constellation-1')).toBe(true);
  });

  it('composes the mission detail with relation-scoped probes and one child region', () => {
    const composed = composeScreen(contract.screens.auto_operator_mission_detail, contract, bundle, pool);
    const main = composed.regions[0];
    expect(main.instances[0].id).toBe('mission-2');
    expect(main.childRegions).toHaveLength(1);
    expect(main.childRegions[0].instances.map(probe => probe.id)).toEqual(['probe-2', 'probe-4', 'probe-7']);
  });

  it('composes mixed home sections and list screens', () => {
    const home = composeScreen(contract.screens.home_operator, contract, bundle, pool);
    expect(home.regions.map(region => `${region.entityType}:${region.instances.length}`)).toEqual([
      'probe:9', 'survey_mission:3', 'observation:10'
    ]);
    const list = composeScreen(contract.screens.auto_operator_probe, contract, bundle, pool);
    expect(list.regions[0].surfaceKind).toBe('list');
    expect(list.regions[0].actions.map(action => action.id)).toEqual(['probe_create', 'observation_link']);
  });

  it('resolves every compiled action, hiding the event-triggered one', () => {
    const probeRender = bundle.types.find(type => type.id === 'probe').render;
    const outcomes = Object.fromEntries(
      Object.values(contract.actions).map(action => [action.id, resolveActionButton(action, { render: probeRender })])
    );
    expect(outcomes.probe_create).toMatchObject({ tone: 'primary' });
    expect(outcomes.probe_delete).toMatchObject({ tone: 'danger', confirm: true });
    expect(outcomes.probe_launch).toMatchObject({ tone: 'state', severity: 'info' });
    expect(outcomes.probe_retire.severity).toBe('secondary');
    expect(outcomes.probe_auto_index.hidden).toBe(true);
    expect(outcomes.observation_link).toMatchObject({ tone: 'text', icon: 'pi pi-link' });
  });

  it('exercises variable relation cardinality across probes', () => {
    const instances = createUiMappingInstances();
    const counts = instances.probes.map(probe => probe.relations.observations.length);
    expect(counts).toEqual([1, 0, 2, 10, 3, 1, 0, 4, 2]);

    const rowSurface = resolveSurface({ id: 'probe', class: 'item' }, { variant: 'row' });
    const budget = rowSurface.budgets.relations;
    const hidden = instances.probes.map(probe => applyBudget(probe.relations.observations, budget).hidden);
    expect(hidden).toEqual([0, 0, 0, 8, 1, 0, 0, 2, 0]);
  });

  it('covers every declarable class, preview mode, and field base across the bundle', () => {
    const classes = new Set(bundle.types.map(type => type.class));
    expect([...classes].sort()).toEqual(['file', 'group', 'item', 'process']);
    expect(bundle.types.filter(type => type.class === 'file').map(type => type.payload.preview)).toEqual([
      'image', 'geometry', 'attachment'
    ]);
    const bases = new Set(bundle.types.flatMap(type => Object.values(type.fields).map(descriptor => descriptor.base)));
    for (const base of ['string', 'number', 'boolean', 'instant', 'json', 'blob', 'ref', 'quantity', 'record', 'list', 'map', 'variant', 'enum']) {
      expect(bases.has(base), base).toBe(true);
    }
    expect(resolvePreview(bundle.types.find(type => type.id === 'spectrum')).component).toBe('GeometryPreview');
  });

  it('resolves every fixture field descriptor in every variant', () => {
    for (const type of bundle.types) {
      for (const [name, descriptor] of Object.entries(type.fields)) {
        for (const variant of VARIANTS) {
          const outcome = resolveFieldControl(descriptor, { variant });
          expect(outcome.component, `${type.id}.${name}/${variant}`).toBeTruthy();
        }
      }
    }
  });

  it('keeps instances in the CTS stored shape with deep lineage', () => {
    const instances = createUiMappingInstances();
    const probes = instances.probes;
    expect(probes.every(probe => probe.lineage.probes?.type === 'star_system')).toBe(true);
    expect(instances.starSystems.every(system => system.lineage.systems?.id === 'constellation-1')).toBe(true);
    const probeFour = probes[3];
    expect(probeFour.relations.spectrum).toEqual({ type: 'spectrum', id: 'spectrum-4' });
    for (const group of [probes, instances.observations, instances.missions]) {
      for (const instance of group) {
        expect(instance).toHaveProperty('id');
        expect(instance).toHaveProperty('type');
        expect(instance).toHaveProperty('typeVersion');
        expect(instance).toHaveProperty('fields');
        expect(instance).toHaveProperty('lineage');
        expect(instance).toHaveProperty('relations');
        expect(instance).toHaveProperty('states');
      }
    }
  });
});
