import { describe, it, expect } from 'vitest';
import {
  resolveFieldControl,
  resolveSurface,
  resolvePreview,
  resolveActionButton,
  applyBudget,
  VARIANTS
} from '#shared/ui-mapping/index.js';
import {
  createUiMappingClientBundle,
  createUiMappingCompiledContract,
  createUiMappingInstances
} from './ui-mapping-fixtures.js';

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

  it('exercise budgets with 0, 1, 3, and 8 related files', () => {
    const instances = createUiMappingInstances();
    const counts = instances.parts.map(part => part.relations.drawings.length);
    expect(counts).toEqual([0, 1, 3, 8]);

    const rowSurface = resolveSurface({ id: 'part', class: 'item' }, { variant: 'row' });
    const detailSurface = resolveSurface({ id: 'part', class: 'item' }, { variant: 'detail' });
    expect(rowSurface.budgets.relations).toEqual({ max: 2, overflow: 'count' });
    expect(detailSurface.budgets.relations).toEqual({ max: 6, overflow: 'more' });

    const budget = rowSurface.budgets.relations;
    const outcomes = instances.parts.map(part => applyBudget(part.relations.drawings, budget).hidden);
    expect(outcomes).toEqual([0, 0, 1, 6]);
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
