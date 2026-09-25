import { describe, it, expect } from 'vitest';
import { composeScreen, buildInstancePool } from './screen.js';

const bundle = {
  types: [
    {
      id: 'widget', class: 'item',
      name: 'Widget',
      glyph: 'pi pi-box',
      identifier: 'name',
      fields: { name: { base: 'string', identifier: true }, size: { base: 'quantity', unit: 'mm' } },
      sections: [{ id: 'summary', label: null, fields: ['name'] }, { id: 'dimensions', label: null, fields: ['size'] }]
    },
    {
      id: 'sheet_file', class: 'file',
      name: 'Sheet',
      glyph: 'pi pi-file',
      identifier: 'title',
      payload: { mime: ['image/png'], preview: 'image' },
      fields: { title: { base: 'string', identifier: true } },
      sections: [{ id: 'summary', label: null, fields: ['title'] }]
    }
  ]
};

const instances = {
  widgets: [
    { id: 'w1', type: 'widget', fields: { name: 'A', size: { value: 1, unit: 'mm' } }, relations: { sheets: [{ type: 'sheet_file', id: 's1' }] }, lineage: {}, state: 'draft' },
    { id: 'w2', type: 'widget', fields: { name: 'B', size: { value: 2, unit: 'mm' } }, relations: { sheets: [] }, lineage: { madeBy: { type: 'widget', id: 'w1' } }, state: 'done' }
  ],
  sheets: [
    { id: 's1', type: 'sheet_file', fields: { title: 'S1' }, relations: {}, lineage: {}, state: null, payload: { fileId: 'f1', mime: 'image/png', size: 1 } }
  ]
};
const pool = buildInstancePool(instances);

const contract = {
  actions: {
    widget_create: { id: 'widget_create', label: 'Create widget', actionKind: 'createInstance', typeId: 'widget', trigger: { mode: 'manual' } },
    widget_auto: { id: 'widget_auto', label: 'Sync', actionKind: 'updateInstance', typeId: 'widget', trigger: { mode: 'event' } }
  }
};

describe('screen composition', () => {
  it('resolves single sources by scope and falls back to the first instance', () => {
    const scoped = composeScreen(
      { screenKey: 'd1', template: 'instanceDetail', label: 'D1', scope: { instanceId: 'w2' },
        sources: [{ id: 'widget', typeId: 'widget', mode: 'single' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' }] },
      contract, bundle, pool
    );
    expect(scoped.regions[0].instances[0].id).toBe('w2');

    const unscoped = composeScreen(
      { screenKey: 'd2', template: 'instanceDetail', label: 'D2',
        sources: [{ id: 'widget', typeId: 'widget', mode: 'single' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' }] },
      contract, bundle, pool
    );
    expect(unscoped.regions[0].instances[0].id).toBe('w1');
  });

  it('scopes list sources by relation and lineage', () => {
    const relationScoped = composeScreen(
      { screenKey: 'r1', template: 'instanceDetail', label: 'R1', scope: { instanceId: 'w1' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'sheets', typeId: 'sheet_file', mode: 'list', relation: { sourceId: 'widget', key: 'sheets' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'sheets', slot: 'children', sourceId: 'sheets', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(relationScoped.regions[0].childRegions[0].instances.map(instance => instance.id)).toEqual(['s1']);

    const lineageScoped = composeScreen(
      { screenKey: 'l1', template: 'typeList', label: 'L1',
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'children', typeId: 'widget', mode: 'list', lineage: { sourceId: 'widget', key: 'madeBy' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'children', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(lineageScoped.regions[0].instances.map(instance => instance.id)).toEqual(['w2']);
  });

  it('scopes list sources by compiled filter placeholders against the screen scope', () => {
    // The compiler-emitted child-region shape: bare declared lineage key
    // filtered by $screen.scope.instanceId — the org-authored hierarchy
    // contract without an authored lineage/relation source.
    const filtered = composeScreen(
      { screenKey: 'f1', template: 'instanceDetail', label: 'F1', scope: { instanceId: 'w1' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'made', typeId: 'widget', mode: 'list', filters: { madeById: '$screen.scope.instanceId' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'made', slot: 'children', sourceId: 'made', surface: 'list' }
        ] },
      contract, bundle, { ...pool, widget: { w1: pool.widget.w1, w2: { ...pool.widget.w2, lineage: { madeBy: { type: 'widget', id: 'w1' }, madeById: { id: 'w1' } } } } }
    );
    expect(filtered.regions[0].childRegions[0].instances.map(instance => instance.id)).toEqual(['w2']);

    // A different opened scope scopes to that parent only.
    const other = composeScreen(
      { screenKey: 'f2', template: 'instanceDetail', label: 'F2', scope: { instanceId: 'w2' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'made', typeId: 'widget', mode: 'list', filters: { madeById: '$screen.scope.instanceId' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'made', slot: 'children', sourceId: 'made', surface: 'list' }
        ] },
      contract, bundle, { ...pool, widget: { w1: pool.widget.w1, w2: { ...pool.widget.w2, lineage: { madeBy: { type: 'widget', id: 'w1' }, madeById: { id: 'w1' } } } } }
    );
    expect(other.regions[0].childRegions[0].instances).toEqual([]);
  });

  it('carries tree-owned chrome per region (container role by depth)', () => {
    const composed = composeScreen(
      { screenKey: 'c1', template: 'instanceDetail', label: 'C1',
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'sheets', typeId: 'sheet_file', mode: 'list', relation: { sourceId: 'widget', key: 'sheets' } }
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
      { screenKey: 'x1', template: 'typeList', label: 'X1',
        sources: [{ id: 'widget', typeId: 'widget', mode: 'list' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list', actions: ['widget_create', 'widget_auto', 'missing'] }] },
      contract, bundle, pool
    );
    const region = composed.regions[0];
    expect(region.actions.map(action => action.id)).toEqual(['widget_create', 'widget_auto']);
    expect(region.surface.component).toBe('ItemRow');
    expect(region.surface.archetype).toBe('record-row');
  });

  it('carries the contract state policy per region keyed by source type', () => {
    // Types carry no state vocabulary (SPEC §7): the compiled process
    // contract's per-type state display policy rides the region tree, and
    // regions for types without a policy carry null (no state surface).
    const withPolicy = composeScreen(
      { screenKey: 'sp1', template: 'typeList', label: 'SP',
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'list' },
          { id: 'sheets', typeId: 'sheet_file', mode: 'list' }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'list' },
          { id: 'sheets', slot: 'main', sourceId: 'sheets', surface: 'list' }
        ] },
      { ...contract, statePolicy: { widget: { draft: { label: 'Draft' } } } }, bundle, pool
    );
    expect(withPolicy.regions[0].statePolicy).toEqual({ draft: { label: 'Draft' } });
    expect(withPolicy.regions[1].statePolicy).toBeNull();
  });

  it('is pure across repeated composition', () => {
    const screen = { screenKey: 'p1', template: 'typeList', label: 'P1',
      sources: [{ id: 'widget', typeId: 'widget', mode: 'list' }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list' }] };
    expect(composeScreen(screen, contract, bundle, pool)).toEqual(composeScreen(screen, contract, bundle, pool));
  });

  it('derives per-region data states from the pool and reported source states', () => {
    const screen = { screenKey: 'ds1', template: 'typeList', label: 'DS',
      sources: [
        { id: 'widget', typeId: 'widget', mode: 'list' },
        { id: 'detail', typeId: 'widget', mode: 'single' }
      ],
      regions: [
        { id: 'list', slot: 'main', sourceId: 'widget', surface: 'list' },
        { id: 'single', slot: 'main', sourceId: 'detail', surface: 'detail' }
      ] };
    const ready = composeScreen(screen, contract, bundle, pool);
    expect(ready.regions[0].dataState).toBe('ready');
    expect(ready.regions[1].dataState).toBe('ready');

    const emptyPool = composeScreen(screen, contract, bundle, {});
    expect(emptyPool.regions[0].dataState).toBe('empty');
    expect(emptyPool.regions[1].dataState).toBe('missing');

    const loading = composeScreen(screen, contract, bundle, {}, { sourceStates: { widget: 'loading', detail: 'denied' } });
    expect(loading.regions[0].dataState).toBe('loading');
    expect(loading.regions[1].dataState).toBe('denied');
  });

  it('attaches the list-controls contract to list regions only', () => {
    const composed = composeScreen(
      { screenKey: 'lc1', template: 'typeList', label: 'LC',
        sources: [{ id: 'widget', typeId: 'widget', mode: 'list' }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list', actions: [] }] },
      contract, bundle, pool
    );
    const controls = composed.regions[0].listControls;
    expect(controls).toBeTruthy();
    expect(controls.sortKeys.map(key => key.name)).toEqual(['name', 'size']);
    expect(controls.searchKeys).toEqual(['name']);
    expect(controls.pagination.rows).toBe(10);
  });
});
