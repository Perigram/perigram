import { describe, it, expect } from 'vitest';
import { composeScreen, buildInstancePool } from './screen.js';

const bundle = {
  types: [
    {
      id: 'widget', class: 'item',
      fields: { name: { base: 'string' }, size: { base: 'quantity', unit: 'mm' } },
      states: { main: { initial: 'draft', values: ['draft', 'done'], terminal: ['done'] } },
      render: { label: 'Widget', icon: 'pi pi-box', states: { done: { severity: 'success' } } }
    },
    {
      id: 'sheet_file', class: 'file',
      payload: { mime: ['image/png'], preview: 'image' },
      fields: { title: { base: 'string' } },
      render: { label: 'Sheet', icon: 'pi pi-file' }
    }
  ]
};

const instances = {
  widgets: [
    { id: 'w1', type: 'widget', fields: { name: 'A', size: { value: 1, unit: 'mm' } }, relations: { sheets: [{ type: 'sheet_file', id: 's1' }] }, lineage: {}, states: { main: 'draft' } },
    { id: 'w2', type: 'widget', fields: { name: 'B', size: { value: 2, unit: 'mm' } }, relations: { sheets: [] }, lineage: { madeBy: { type: 'widget', id: 'w1' } }, states: { main: 'done' } }
  ],
  sheets: [
    { id: 's1', type: 'sheet_file', fields: { title: 'S1' }, relations: {}, lineage: {}, states: {}, payload: { fileId: 'f1', mime: 'image/png', size: 1 } }
  ]
};
const pool = buildInstancePool(instances);

const contract = {
  actions: {
    widget_create: { id: 'widget_create', label: 'Create widget', actionKind: 'createEntity', entityType: 'widget', trigger: { mode: 'manual' } },
    widget_auto: { id: 'widget_auto', label: 'Sync', actionKind: 'updateEntity', entityType: 'widget', trigger: { mode: 'event' } }
  }
};

describe('screen composition', () => {
  it('resolves single sources by scope and falls back to the first instance', () => {
    const scoped = composeScreen(
      { screenKey: 'd1', template: 'entityDetail', label: 'D1', scope: { entityId: 'w2' },
        sources: [{ id: 'widget', entityType: 'widget', mode: 'single' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' }] },
      contract, bundle, pool
    );
    expect(scoped.regions[0].instances[0].id).toBe('w2');

    const unscoped = composeScreen(
      { screenKey: 'd2', template: 'entityDetail', label: 'D2',
        sources: [{ id: 'widget', entityType: 'widget', mode: 'single' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' }] },
      contract, bundle, pool
    );
    expect(unscoped.regions[0].instances[0].id).toBe('w1');
  });

  it('scopes list sources by relation and lineage', () => {
    const relationScoped = composeScreen(
      { screenKey: 'r1', template: 'entityDetail', label: 'R1', scope: { entityId: 'w1' },
        sources: [
          { id: 'widget', entityType: 'widget', mode: 'single' },
          { id: 'sheets', entityType: 'sheet_file', mode: 'list', relation: { sourceId: 'widget', key: 'sheets' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'sheets', slot: 'children', sourceId: 'sheets', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(relationScoped.regions[0].childRegions[0].instances.map(instance => instance.id)).toEqual(['s1']);

    const lineageScoped = composeScreen(
      { screenKey: 'l1', template: 'entityList', label: 'L1',
        sources: [
          { id: 'widget', entityType: 'widget', mode: 'single' },
          { id: 'children', entityType: 'widget', mode: 'list', lineage: { sourceId: 'widget', key: 'madeBy' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'children', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(lineageScoped.regions[0].instances.map(instance => instance.id)).toEqual(['w2']);
  });

  it('carries tree-owned chrome per region (container role by depth)', () => {
    const composed = composeScreen(
      { screenKey: 'c1', template: 'entityDetail', label: 'C1',
        sources: [
          { id: 'widget', entityType: 'widget', mode: 'single' },
          { id: 'sheets', entityType: 'sheet_file', mode: 'list', relation: { sourceId: 'widget', key: 'sheets' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'sheets', slot: 'children', sourceId: 'sheets', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(composed.regions[0].chrome).toMatchObject({ role: 'section', flattened: false, surface: 'none' });
    expect(composed.regions[0].childRegions[0].chrome).toMatchObject({ role: 'card', flattened: false, surface: 'content' });
  });

  it('resolves region action records and carries surface policy per region', () => {
    const composed = composeScreen(
      { screenKey: 'x1', template: 'entityList', label: 'X1',
        sources: [{ id: 'widget', entityType: 'widget', mode: 'list' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list', actions: ['widget_create', 'widget_auto', 'missing'] }] },
      contract, bundle, pool
    );
    const region = composed.regions[0];
    expect(region.actions.map(action => action.id)).toEqual(['widget_create', 'widget_auto']);
    expect(region.surface.component).toBe('ItemRow');
    expect(region.surface.archetype).toBe('record-row');
  });

  it('is pure across repeated composition', () => {
    const screen = { screenKey: 'p1', template: 'entityList', label: 'P1',
      sources: [{ id: 'widget', entityType: 'widget', mode: 'list' }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list' }] };
    expect(composeScreen(screen, contract, bundle, pool)).toEqual(composeScreen(screen, contract, bundle, pool));
  });
});
