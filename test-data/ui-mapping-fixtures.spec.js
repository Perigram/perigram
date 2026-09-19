import { describe, it, expect } from 'vitest';
import {
  resolveFieldControl,
  resolveSurface,
  resolveActionButton,
  composeScreen,
  buildInstancePool,
  applyBudget,
  instanceIdentity,
  resolveListLayout,
  VARIANTS
} from '#shared/ui-mapping/index.js';
import {
  createUiMappingClientBundle,
  createUiMappingCompiledContract,
  createUiMappingInstances
} from './ui-mapping-fixtures.js';

const bundle = createUiMappingClientBundle();
const contract = createUiMappingCompiledContract();
const instances = createUiMappingInstances();
const pool = buildInstancePool(instances);

describe('the maritime hydration stresses structures the layer never saw', () => {
  it('declares one group with two child types and a third parent for the same child', () => {
    const fleet = bundle.types.find(type => type.id === 'fleet');
    expect(Object.keys(fleet.edges.children)).toEqual(['convoys', 'directVessels']);
    const parentsOfVessel = bundle.types
      .filter(type => Object.values(type.edges?.children || {}).some(edge => edge.types.includes('vessel')))
      .map(type => type.id);
    expect(parentsOfVessel).toEqual(['fleet', 'convoy', 'port']);
  });

  it('composes the fleet detail with two lineage-scoped child regions of different kinds', () => {
    const composed = composeScreen(contract.screens.auto_operator_fleet_detail, contract, bundle, pool);
    const main = composed.regions[0];
    expect(main.instances[0].id).toBe('fleet-1');
    const childKinds = main.childRegions.map(child => `${child.typeId}:${child.instances.length}`);
    expect(childKinds).toEqual(['convoy:3', 'vessel:2']);
    expect(main.childRegions[0].instances.every(convoy => convoy.lineage.convoys?.id === 'fleet-1')).toBe(true);
    expect(main.childRegions[1].instances.every(vessel => vessel.lineage.directVessels?.id === 'fleet-1')).toBe(true);
  });

  it('resolves a hierarchical list layout for the convoy typeList screen', () => {
    const composed = composeScreen(contract.screens.auto_operator_convoy, contract, bundle, pool);
    expect(resolveListLayout(composed.regions[0].type, { hierarchical: true })).toBe('tree-table');
    expect(composed.regions[0].instances).toHaveLength(3);
  });

  it('composes the vessel detail with certificate cards and a log timeline', () => {
    const composed = composeScreen(contract.screens.auto_operator_vessel_detail, contract, bundle, pool);
    const main = composed.regions[0];
    expect(main.instances[0].id).toBe('vessel-3');
    const childKinds = main.childRegions.map(child => `${child.typeId}:${child.instances.length}`);
    expect(childKinds).toEqual(['certificate:1', 'log_entry:2']);
    expect(resolveListLayout(bundle.types.find(type => type.id === 'certificate'), {})).toBe('card-grid');
    expect(resolveListLayout(bundle.types.find(type => type.id === 'log_entry'), {})).toBe('timeline');
  });

  it('renders a file instanceDetail (certificate preview surface)', () => {
    const composed = composeScreen(contract.screens.auto_operator_certificate_detail, contract, bundle, pool);
    expect(composed.regions[0].surfaceKind).toBe('detail');
    expect(composed.regions[0].instances[0].id).toBe('certificate-2');
    expect(composed.regions[0].childRegions).toHaveLength(0);
  });

  it('carries refs in exotic positions: self-type, inside variant payloads, group-to-item', () => {
    expect(bundle.types.find(type => type.id === 'vessel').fields.escortOf.accepts).toEqual(['vessel']);
    expect(instances.vessels[0].fields.escortOf).toBeNull();
    expect(instances.vessels[1].fields.escortOf).toEqual({ type: 'vessel', id: 'vessel-1' });
    const routePayloads = bundle.types.find(type => type.id === 'route_run').fields.config.payloads;
    expect(routePayloads.viaHub.fields.hub.accepts).toEqual(['convoy']);
    expect(instances.routes[1].fields.config.value.hub).toEqual({ type: 'convoy', id: 'convoy-2' });
    expect(bundle.types.find(type => type.id === 'fleet').edges.relations.partnerPorts.types).toEqual(['port']);
  });

  it('covers every declarable class, preview mode, and field base', () => {
    const classes = new Set(bundle.types.map(type => type.class));
    expect([...classes].sort()).toEqual(['file', 'group', 'item', 'process']);
    expect(bundle.types.filter(type => type.class === 'file').map(type => type.payload.preview)).toEqual([
      'image', 'attachment'
    ]);
    const bases = new Set(bundle.types.flatMap(type => Object.values(type.fields).map(descriptor => descriptor.base)));
    for (const base of ['string', 'number', 'boolean', 'instant', 'json', 'blob', 'ref', 'quantity', 'record', 'list', 'map', 'variant', 'enum']) {
      expect(bases.has(base), base).toBe(true);
    }
    expect(bundle.types.find(type => type.id === 'vessel').fields.flags.itemType.base).toBe('enum');
    expect(bundle.types.find(type => type.id === 'route_run').fields.waypoints.itemType.base).toBe('instant');
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

  it('places the home sections by weight', () => {
    const home = composeScreen(contract.screens.home_operator, contract, bundle, pool);
    expect(home.regions.map(region => `${region.typeId}:${region.instances.length}`)).toEqual(['vessel:10', 'convoy:3']);
    expect(home.regionsMode).toBe('tabs');
    expect(home.density).toBe('regular');
  });

  it('exercises variable certificate cardinality and single-instance types', () => {
    const counts = instances.vessels.map(vessel => vessel.relations.certificates.length);
    expect(new Set(counts).size).toBeGreaterThan(4);
    expect(counts).toContain(6);
    expect(counts).toContain(0);
    expect(instances.beacons).toHaveLength(1);
    const budget = resolveSurface({ id: 'vessel', class: 'item' }, { variant: 'row' }).budgets.relations;
    expect(instances.vessels.map(vessel => applyBudget(vessel.relations.certificates, budget).hidden)).toContain(4);
  });

  it('resolves every compiled action with the CTS vocabulary', () => {
    const vesselRender = bundle.types.find(type => type.id === 'vessel').render;
    const outcomes = Object.fromEntries(
      Object.values(contract.actions).map(action => [action.id, resolveActionButton(action, { render: vesselRender })])
    );
    expect(outcomes.vessel_create).toMatchObject({ tone: 'primary' });
    expect(outcomes.vessel_delete).toMatchObject({ tone: 'danger', confirm: true });
    expect(outcomes.vessel_depart).toMatchObject({ tone: 'state', severity: 'info' });
    expect(outcomes.vessel_auto_ping.hidden).toBe(true);
    expect(outcomes.certificate_link).toMatchObject({ tone: 'text', icon: 'pi pi-link' });
  });

  it('resolves declared identities across every type', () => {
    expect(instanceIdentity(bundle.types.find(type => type.id === 'fleet'), pool.fleet['fleet-1'])).toBe('Meridian Line');
    expect(instanceIdentity(bundle.types.find(type => type.id === 'port'), pool.port['port-2'])).toBe('PT-KLV');
    expect(instanceIdentity(bundle.types.find(type => type.id === 'vessel'), pool.vessel['vessel-4'])).toBe('Dourado');
    expect(instanceIdentity(bundle.types.find(type => type.id === 'certificate'), pool.certificate['certificate-2'])).toBe('A2');
  });

  it('keeps the showcase default screen key present in the contract', () => {
    expect(contract.screens.auto_operator_vessel_detail?.screenKey).toBe('auto_operator_vessel_detail');
  });
});
