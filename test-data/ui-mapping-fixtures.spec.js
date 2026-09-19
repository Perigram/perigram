import { describe, it, expect } from 'vitest';
import {
  resolveFieldControl,
  resolveSurface,
  resolvePreview,
  resolveActionButton,
  composeScreen,
  buildInstancePool,
  applyBudget,
  instanceIdentity,
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

describe('screen composition over the facilities fixtures', () => {
  it('composes the unit detail screen with relation-scoped tabbed children', () => {
    const composed = composeScreen(contract.screens.auto_operator_unit_detail, contract, bundle, pool);
    expect(composed.template).toBe('instanceDetail');
    const main = composed.regions[0];
    expect(main.surfaceKind).toBe('detail');
    expect(main.instances[0].id).toBe('unit-4');
    expect(main.actions.map(action => action.id)).toEqual([
      'unit_update', 'unit_start', 'unit_retire', 'unit_delete', 'reading_link'
    ]);
    const childKinds = main.childRegions.map(child => `${child.typeId}:${child.instances.length}:${child.surfaceKind}`);
    expect(childKinds).toEqual([
      'reading:10:list',
      'schematic:1:list',
      'log_entry:3:list'
    ]);
    expect(main.childrenMode).toBe('tabs');
  });

  it('composes the zone detail with lineage-scoped sectors and a four-level tree', () => {
    const composed = composeScreen(contract.screens.auto_operator_zone_detail, contract, bundle, pool);
    const children = composed.regions[0].childRegions[0];
    expect(children.typeId).toBe('sector');
    expect(children.instances).toHaveLength(3);
    expect(children.instances.every(sector => sector.lineage.sectors?.id === 'zone-1')).toBe(true);
    const units = Object.values(pool.unit);
    expect(units.every(unit => unit.lineage.units?.type === 'station')).toBe(true);
    const stations = Object.values(pool.station);
    expect(stations.every(station => station.lineage.stations?.type === 'sector')).toBe(true);
    expect(Object.values(pool.sector).every(sector => sector.lineage.sectors?.type === 'zone')).toBe(true);
  });

  it('composes the audit detail with relation-scoped units', () => {
    const composed = composeScreen(contract.screens.auto_operator_audit_detail, contract, bundle, pool);
    const main = composed.regions[0];
    expect(main.instances[0].id).toBe('audit-2');
    expect(main.childRegions).toHaveLength(1);
    expect(main.childRegions[0].instances.map(unit => unit.id)).toEqual(['unit-2', 'unit-4', 'unit-7']);
  });

  it('tabs heavy home sections and stays dense', () => {
    const home = composeScreen(contract.screens.home_operator, contract, bundle, pool);
    expect(home.regions.map(region => `${region.typeId}:${region.instances.length}`)).toEqual([
      'unit:12', 'audit_run:3', 'reading:10'
    ]);
    expect(home.regionsMode).toBe('tabs');
    expect(home.density).toBe('compact');
    expect(composeScreen(contract.screens.auto_operator_unit_detail, contract, bundle, pool).regionsMode).toBe('stack');
  });

  it('resolves every compiled action, hiding the event-triggered one', () => {
    const unitRender = bundle.types.find(type => type.id === 'unit').render;
    const outcomes = Object.fromEntries(
      Object.values(contract.actions).map(action => [action.id, resolveActionButton(action, { render: unitRender })])
    );
    expect(outcomes.unit_create).toMatchObject({ tone: 'primary' });
    expect(outcomes.unit_delete).toMatchObject({ tone: 'danger', confirm: true });
    expect(outcomes.unit_start).toMatchObject({ tone: 'state', severity: 'info' });
    expect(outcomes.unit_retire.severity).toBe('secondary');
    expect(outcomes.unit_auto_index.hidden).toBe(true);
    expect(outcomes.reading_link).toMatchObject({ tone: 'text', icon: 'pi pi-link' });
  });

  it('exercises variable relation cardinality and single refs across units', () => {
    const instances = createUiMappingInstances();
    const counts = instances.units.map(unit => unit.relations.readings.length);
    expect(new Set(counts).size).toBeGreaterThan(5);
    expect(instances.units.filter(unit => unit.relations.schematic).length).toBeGreaterThan(0);
    expect(instances.units.some(unit => !unit.relations.schematic)).toBe(true);

    const rowSurface = resolveSurface({ id: 'unit', class: 'item' }, { variant: 'row' });
    const budget = rowSurface.budgets.relations;
    const hidden = instances.units.map(unit => applyBudget(unit.relations.readings, budget).hidden);
    expect(hidden).toContain(8);
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
    expect(resolvePreview(bundle.types.find(type => type.id === 'schematic')).component).toBe('GeometryPreview');
    expect(bundle.types.find(type => type.id === 'reading').render.identityField).toBe('title');
    expect(instanceIdentity(bundle.types.find(type => type.id === 'sector'), pool.sector['sector-2'])).toBe('NR-07/Beta');
    expect(instanceIdentity(bundle.types.find(type => type.id === 'reading'), pool.reading['reading-3'])).toContain('Pass 3');
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

  it('keeps instances in the CTS stored shape with declared identity fields', () => {
    const instances = createUiMappingInstances();
    for (const group of [instances.units, instances.stations, instances.audits]) {
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
    expect(instances.units[3].relations.schematic).toEqual({ type: 'schematic', id: 'schematic-4' });
  });

  it('keeps the showcase default screen key present in the contract', () => {
    expect(contract.screens.auto_operator_unit_detail?.screenKey).toBe('auto_operator_unit_detail');
  });
});
