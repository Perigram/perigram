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
  it('composes the part detail screen with a scoped single source and relation-scoped drawings', () => {
    const composed = composeScreen(contract.screens.auto_operator_part_detail, contract, bundle, pool);
    expect(composed.template).toBe('entityDetail');
    const main = composed.regions[0];
    expect(main.surfaceKind).toBe('detail');
    expect(main.variant).toBe('full');
    expect(main.instances[0].id).toBe('part-4');
    expect(main.actions.map(action => action.id)).toEqual([
      'part_update', 'part_approve', 'part_scrap', 'part_delete', 'drawing_link'
    ]);
    const drawings = main.childRegions[0];
    expect(drawings.instances).toHaveLength(8);
    expect(drawings.instances.every(instance => instance.type === 'drawing')).toBe(true);
    expect(drawings.surface.component).toBe('FileRow');
  });

  it('scopes material children by lineage and places the create action on the child region', () => {
    const composed = composeScreen(contract.screens.auto_operator_material_detail, contract, bundle, pool);
    const children = composed.regions[0].childRegions[0];
    expect(children.instances).toHaveLength(4);
    expect(children.instances.every(part => part.lineage.parts?.id === 'material-1')).toBe(true);
    expect(children.actions.map(action => action.id)).toEqual(['part_create']);
  });

  it('composes list and home screens with unscoped collections', () => {
    const list = composeScreen(contract.screens.auto_operator_part, contract, bundle, pool);
    expect(list.regions[0].instances).toHaveLength(8);
    expect(list.regions[0].actions.map(action => action.id)).toEqual(['part_create', 'drawing_link']);
    const home = composeScreen(contract.screens.home_operator, contract, bundle, pool);
    expect(home.regions[0].instances).toHaveLength(8);
  });
});

describe('ui-mapping fixtures', () => {
  it('cover every declarable class across the bundle', () => {
    const bundle = createUiMappingClientBundle();
    const classes = new Set(bundle.types.map(type => type.class));
    expect([...classes].sort()).toEqual(['file', 'group', 'item', 'process']);
    expect(bundle.types.filter(type => type.class === 'file').map(type => type.payload.preview)).toEqual([
      'image', 'geometry', 'attachment'
    ]);
  });

  it('resolve every fixture field descriptor in every variant', () => {
    const bundle = createUiMappingClientBundle();
    for (const type of bundle.types) {
      for (const [name, descriptor] of Object.entries(type.fields)) {
        for (const variant of VARIANTS) {
          const outcome = resolveFieldControl(descriptor, { variant });
          expect(outcome.component, `${type.id}.${name}/${variant}`).toBeTruthy();
        }
      }
    }
  });

  it('resolve a preview component per file type from declared preview modes', () => {
    const bundle = createUiMappingClientBundle();
    const byType = Object.fromEntries(bundle.types.map(type => [type.id, type]));
    expect(resolvePreview(byType.drawing).component).toBe('ImagePreview');
    expect(resolvePreview(byType.dxf_model).component).toBe('GeometryPreview');
    expect(resolvePreview(byType.report).component).toBe('AttachmentPreview');
    expect(resolveSurface(byType.part, { variant: 'row' }).component).toBe('ItemRow');
  });

  it('resolve every compiled action, hiding the event-triggered one', () => {
    const contract = createUiMappingCompiledContract();
    const bundle = createUiMappingClientBundle();
    const render = bundle.types.find(type => type.id === 'part').render;
    const outcomes = Object.fromEntries(
      Object.values(contract.actions).map(action => [action.id, resolveActionButton(action, { render })])
    );
    expect(outcomes.part_create).toMatchObject({ tone: 'primary' });
    expect(outcomes.part_delete).toMatchObject({ tone: 'danger', confirm: true });
    expect(outcomes.part_approve).toMatchObject({ tone: 'state', severity: 'success' });
    expect(outcomes.part_scrap.severity).toBe('danger');
    expect(outcomes.part_sync_summary.hidden).toBe(true);
    expect(outcomes.drawing_link).toMatchObject({ tone: 'text', icon: 'pi pi-link' });
  });

  it('exercise budgets with varied file counts across the collection', () => {
    const instances = createUiMappingInstances();
    const counts = instances.parts.map(part => part.relations.drawings.length);
    expect(counts).toEqual([0, 1, 3, 8, 2, 5, 1, 4]);

    const rowSurface = resolveSurface({ id: 'part', class: 'item' }, { variant: 'row' });
    const detailSurface = resolveSurface({ id: 'part', class: 'item' }, { variant: 'detail' });
    expect(rowSurface.budgets.relations).toEqual({ max: 2, overflow: 'count' });
    expect(detailSurface.budgets.relations).toEqual({ max: 6, overflow: 'more' });

    const budget = rowSurface.budgets.relations;
    const outcomes = instances.parts.map(part => applyBudget(part.relations.drawings, budget).hidden);
    expect(outcomes).toEqual([0, 0, 1, 6, 0, 3, 0, 2]);
  });

  it('keep instances in the CTS stored shape', () => {
    const instances = createUiMappingInstances();
    for (const group of [instances.parts, instances.drawings, instances.machines]) {
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
    expect(instances.parts[0].lineage.parts).toEqual({ type: 'material', id: 'material-1' });
  });
});
