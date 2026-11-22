import { describe, it, expect } from 'vitest';
import { composeScreen, buildInstancePool, recordChildSectionKey, composeDocumentSections } from './screen.js';
import { incomingChildrenEdges, parentRefOf } from './index.js';

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

  it('injects relation link and unlink actions into their relation-scoped sections', () => {
    const relationContract = {
      actions: {
        ...contract.actions,
        sheets_link: { id: 'sheets_link', label: 'Link sheet', actionKind: 'link', typeId: 'widget', relation: { key: 'sheets', targetTypes: ['sheet_file'] }, trigger: { mode: 'manual' } },
        sheets_unlink: { id: 'sheets_unlink', label: 'Unlink sheet', actionKind: 'unlink', typeId: 'widget', relationMutation: { key: 'sheets', operation: 'unlink', targetTypes: ['sheet_file'] }, trigger: { mode: 'manual' } },
        ghost_link: { id: 'ghost_link', label: 'Link ghost', actionKind: 'link', typeId: 'widget', relation: { key: 'ghosts', targetTypes: ['widget'] }, trigger: { mode: 'manual' } }
      }
    };
    const screen = composeScreen(
      { screenKey: 'r2', template: 'instanceDetail', label: 'R2', scope: { instanceId: 'w1' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'sheets', typeId: 'sheet_file', mode: 'list', relation: { sourceId: 'widget', key: 'sheets' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail', actions: ['sheets_link', 'sheets_unlink', 'ghost_link', 'widget_create'] },
          { id: 'sheets', slot: 'children', sourceId: 'sheets', surface: 'list', actions: [] }
        ] },
      relationContract, bundle, pool
    );
    const detail = screen.regions[0];
    const section = detail.childRegions[0];
    expect(section.actions.map(action => action.id)).toEqual(['sheets_link', 'sheets_unlink']);
    expect(section.relationParent.id).toBe('w1');
    // A link with no section for its relation keeps the header as its
    // fallback surface; every non-relation action stays.
    expect(detail.actions.map(action => action.id)).toEqual(['ghost_link', 'widget_create']);
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
    expect(other.regions[0].stubRegions[0].instances).toEqual([]);
  });

  it('never guesses the scoped instance and yields nothing on an unresolved scope placeholder', () => {
    // The screen's own scoped instance is explicit: a scope id that is not
    // in the pool is a missing detail, not the first loaded record.
    const missing = composeScreen(
      { screenKey: 'm1', template: 'instanceDetail', label: 'M1', typeId: 'widget', scope: { instanceId: 'w404' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'made', typeId: 'widget', mode: 'list', filters: { madeById: '$screen.scope.instanceId' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'made', slot: 'children', sourceId: 'made', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(missing.regions[0].instances).toEqual([]);
    expect(missing.regions[0].dataState).toBe('missing');
    // The child filter pins to the unknown scope: no instances, never the
    // whole child collection.
    expect(missing.regions[0].stubRegions[0].instances).toEqual([]);

    const unscoped = composeScreen(
      { screenKey: 'm2', template: 'instanceDetail', label: 'M2', typeId: 'widget',
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'made', typeId: 'widget', mode: 'list', filters: { madeById: '$screen.scope.instanceId' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'made', slot: 'children', sourceId: 'made', surface: 'list' }
        ] },
      contract, bundle, pool
    );
    expect(unscoped.regions[0].stubRegions[0].instances).toEqual([]);
  });

  it('matches lineage and relation references in both stored shapes', () => {
    const rawPool = buildInstancePool({
      widgets: [
        { id: 'w1', type: 'widget', fields: { name: 'A' }, relations: { sheets: ['s1'] }, lineage: {} },
        { id: 'w2', type: 'widget', fields: { name: 'B' }, relations: {}, lineage: { madeBy: 'w1' } }
      ],
      sheets: [
        { id: 's1', type: 'sheet_file', fields: { title: 'S1' }, relations: {}, lineage: {}, state: null }
      ]
    });
    const screen = { screenKey: 'raw1', template: 'instanceDetail', label: 'RAW', typeId: 'widget', scope: { instanceId: 'w1' },
      sources: [
        { id: 'widget', typeId: 'widget', mode: 'single' },
        { id: 'sheets', typeId: 'sheet_file', mode: 'list', relation: { sourceId: 'widget', key: 'sheets' } },
        { id: 'children', typeId: 'widget', mode: 'list', lineage: { sourceId: 'widget', key: 'madeBy' } }
      ],
      regions: [
        { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
        { id: 'sheets', slot: 'children', sourceId: 'sheets', surface: 'list' },
        { id: 'children', slot: 'children', sourceId: 'children', surface: 'list' }
      ] };
    const composed = composeScreen(screen, contract, bundle, rawPool);
    expect(composed.regions[0].childRegions.map(region => region.instances.map(instance => instance.id))).toEqual([['s1'], ['w2']]);
  });

  it('composes the containment cross-cut for a type that can be someone\'s child', () => {
    const nestedBundle = {
      types: [
        ...bundle.types,
        {
          id: 'bin', class: 'group', name: 'Bin', identifier: 'name',
          fields: { name: { base: 'string' } },
          edges: { children: { parts: { types: ['widget'], lineageKey: 'binId' } } }
        }
      ]
    };
    const nestedPool = buildInstancePool({
      widgets: [
        { id: 'root1', type: 'widget', fields: { name: 'Root' }, relations: {}, lineage: {} },
        { id: 'child1', type: 'widget', fields: { name: 'Child' }, relations: {}, lineage: { binId: { id: 'b1' } } },
        { id: 'child2', type: 'widget', fields: { name: 'RawChild' }, relations: {}, lineage: { binId: 'b1' } }
      ]
    });
    const screen = { screenKey: 'roots', template: 'typeList', label: 'Roots',
      sources: [{ id: 'widget', typeId: 'widget', mode: 'list' }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list' }] };
    // Every instance lists — the surface cannot nest, so parent context
    // (not omission) carries containment: each row's parent resolves
    // through the incoming children edges, both stored ref shapes.
    expect(composeScreen(screen, contract, nestedBundle, nestedPool).regions[0].instances.map(instance => instance.id))
      .toEqual(['root1', 'child1', 'child2']);
    const edges = incomingChildrenEdges(nestedBundle, 'widget');
    expect(edges).toEqual([{ parentTypeId: 'bin', key: 'binId' }]);
    expect(parentRefOf(nestedPool.widget.root1, edges)).toBeNull();
    expect(parentRefOf(nestedPool.widget.child1, edges)).toEqual({ parentTypeId: 'bin', parentId: 'b1' });
    expect(parentRefOf(nestedPool.widget.child2, edges)).toEqual({ parentTypeId: 'bin', parentId: 'b1' });

    // Compiled type lists ship an empty filters map: same cross-cut —
    // the empty map never narrows the listing.
    const emptyFilters = { ...screen, sources: [{ ...screen.sources[0], filters: {} }] };
    expect(composeScreen(emptyFilters, contract, nestedBundle, nestedPool).regions[0].instances.map(instance => instance.id))
      .toEqual(['root1', 'child1', 'child2']);

    // A type no children edge names keeps the total list.
    expect(composeScreen(screen, contract, bundle, nestedPool).regions[0].instances.map(instance => instance.id).sort())
      .toEqual(['child1', 'child2', 'root1']);
  });

  it('keeps a self-recursive class list flat while the cross-cut resolves child parents (owner direction)', () => {
    // A class's list surface is always flat — containment navigation is
    // the workspace explorer's — so a self-recursive type lists parents
    // AND children. The cross-cut keeps that pile readable: each child's
    // parent ref resolves through the type's own self-edge, in both
    // stored ref shapes.
    const recursiveBundle = {
      types: [{
        ...bundle.types[0],
        edges: { children: { subtrees: { types: ['widget'], lineageKey: 'parentId' } } }
      }]
    };
    const recursivePool = buildInstancePool({
      widgets: [
        { id: 'root1', type: 'widget', fields: { name: 'Root' }, relations: {}, lineage: {} },
        { id: 'child1', type: 'widget', fields: { name: 'Child' }, relations: {}, lineage: { parentId: { type: 'widget', id: 'root1' } } },
        { id: 'child2', type: 'widget', fields: { name: 'RawChild' }, relations: {}, lineage: { parentId: 'root1' } }
      ]
    });
    const screen = { screenKey: 'recursive', template: 'typeList', label: 'Folders',
      sources: [{ id: 'widget', typeId: 'widget', mode: 'list' }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'widget', surface: 'list' }] };
    const composed = composeScreen(screen, contract, recursiveBundle, recursivePool);
    expect(composed.regions[0].instances.map(instance => instance.id)).toEqual(['root1', 'child1', 'child2']);
    const edges = incomingChildrenEdges(recursiveBundle, 'widget');
    expect(edges).toEqual([{ parentTypeId: 'widget', key: 'parentId' }]);
    expect(parentRefOf(recursivePool.widget.child1, edges)).toEqual({ parentTypeId: 'widget', parentId: 'root1' });
    expect(parentRefOf(recursivePool.widget.child2, edges)).toEqual({ parentTypeId: 'widget', parentId: 'root1' });
    expect(parentRefOf(recursivePool.widget.root1, edges)).toBeNull();
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
    expect(emptyPool.stubRegions[0].dataState).toBe('empty');
    expect(emptyPool.regions[0].dataState).toBe('missing');

    const keptEmptyList = composeScreen(screen, contract, bundle, {}, { keepEmptyLists: true });
    expect(keptEmptyList.regions[0].dataState).toBe('empty');
    expect(keptEmptyList.stubRegions).toEqual([]);

    const loading = composeScreen(screen, contract, bundle, {}, { sourceStates: { widget: 'loading', detail: 'denied' } });
    expect(loading.regions[0].dataState).toBe('loading');
    expect(loading.regions[1].dataState).toBe('denied');

    // A reported 'ready' never upgrades an unresolved single source: the
    // data layer counts the type bucket, but a detail surface is ready
    // only when its scoped instance resolved (a host listing the type
    // while the opened record is gone/deleted must compose 'missing').
    const staleScope = composeScreen({ ...screen, typeId: 'widget', scope: { instanceId: 'gone' } }, contract, bundle, pool, {
      sourceStates: { detail: 'ready' }
    });
    expect(staleScope.regions[1].dataState).toBe('missing');
    expect(staleScope.regions[1].instances).toEqual([]);

    // A reported empty/missing describes the fetch, not the data: rows
    // the pool gained after it (a created record lands with a snapshot
    // while the screen stays mounted) render as ready.
    const arrived = composeScreen(screen, contract, bundle, pool, {
      sourceStates: { list: 'empty', detail: 'missing' }
    });
    expect(arrived.regions[0].dataState).toBe('ready');
    expect(arrived.regions[1].dataState).toBe('ready');
  });

  it('arranges relation child collections through the weight ladder', () => {
    const relatedWidgets = Array.from({ length: 6 }, (_, index) => ({
      id: `rw${index}`, type: 'widget', fields: { name: `RW${index}`, size: { value: index + 1, unit: 'mm' } }, relations: {}, lineage: {}, state: 'draft'
    }));
    const widgetPool = buildInstancePool({
      widgets: [
        { id: 'host', type: 'widget', fields: { name: 'Host' }, relations: {
          reviews: relatedWidgets.map(instance => ({ type: 'widget', id: instance.id })),
          audits: relatedWidgets.map(instance => ({ type: 'widget', id: instance.id }))
        }, lineage: {}, state: 'draft' },
        ...relatedWidgets
      ]
    });
    const relationScreen = extra => composeScreen(
      { screenKey: 'rr', template: 'instanceDetail', label: 'RR', typeId: 'widget', scope: { instanceId: 'host' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'widget_reviews_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'reviews' } },
          { id: 'widget_audits_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'audits' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'reviews', slot: 'children', sourceId: 'widget_reviews_related', surface: 'card' },
          { id: 'audits', slot: 'children', sourceId: 'widget_audits_related', surface: 'card' }
        ],
        ...extra },
      contract, bundle, widgetPool
    );
    // Two light table peers claim whole rows (full breadth) and stack
    // below the body at every step; their relation keys cover the record
    // body's chip rows. Full-breadth children never ride the side rail.
    const light = relationScreen();
    expect(light.regions[0].childRegions.map(region => region.relationKey)).toEqual(['reviews', 'audits']);
    expect(light.regions[0].childArrangement.narrow).toEqual({ mode: 'stack' });
    expect(light.regions[0].childArrangement.wide).toEqual({ mode: 'stack' });
    expect(light.regions[0].sideRail).toBe(null);

    // Heavy card-scale peers (3 preview cards = 14 estimated rows each)
    // tab in weight order.
    const heavyWidgets = relatedWidgets.slice(0, 3);
    const heavyPool = buildInstancePool({
      widgets: [
        { id: 'host', type: 'widget', fields: { name: 'Host' }, relations: {
          reviews: heavyWidgets.map(instance => ({ type: 'widget', id: instance.id })),
          audits: heavyWidgets.map(instance => ({ type: 'widget', id: instance.id }))
        }, lineage: {}, state: 'draft' },
        ...relatedWidgets
      ],
      sheets: Array.from({ length: 0 })
    });
    const cardBundle = { types: bundle.types.map(type => (
      type.id === 'widget' ? { ...type, class: 'file', payload: { mime: ['image/png'], preview: 'image' } } : type
    )) };
    const heavy = composeScreen(
      { screenKey: 'rr2', template: 'instanceDetail', label: 'RR', typeId: 'widget', scope: { instanceId: 'host' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'widget_reviews_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'reviews' } },
          { id: 'widget_audits_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'audits' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'reviews', slot: 'children', sourceId: 'widget_reviews_related', surface: 'card' },
          { id: 'audits', slot: 'children', sourceId: 'widget_audits_related', surface: 'card' }
        ] },
      contract, cardBundle, heavyPool
    );
    expect(heavy.regions[0].childArrangement.wide.mode).toBe('stack');
    expect(heavy.regions[0].childArrangement.narrow.mode).toBe('stack');
    expect(heavy.regions[0].sideRail).toBe(null);
    // The peek presentation keeps the ladder: the same heavy child set
    // tabs in weight order when the record renders as a peek.
    const peek = composeScreen(
      { screenKey: 'rr2', template: 'instanceDetail', label: 'RR', typeId: 'widget', scope: { instanceId: 'host' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'widget_reviews_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'reviews' } },
          { id: 'widget_audits_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'audits' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'reviews', slot: 'children', sourceId: 'widget_reviews_related', surface: 'card' },
          { id: 'audits', slot: 'children', sourceId: 'widget_audits_related', surface: 'card' }
        ] },
      contract, cardBundle, heavyPool,
      { presentation: 'peek' }
    );
    expect(peek.regions[0].childArrangement.wide.mode).toBe('tabs');
    expect(peek.regions[0].childArrangement.narrow.mode).toBe('tabs');
  });

  it('excludes tabs inside a tabbed sections arrangement', () => {
    // A tabbed screen step places every top-level region inside a tab,
    // so the record's heavy child set stacks there — tabs sit one tab
    // deep, even over one ancestor (SPEC §22.1).
    const cardBundle = { types: bundle.types.map(type => (
      type.id === 'widget' ? { ...type, class: 'file', payload: { mime: ['image/png'], preview: 'image' } } : type
    )) };
    const related = Array.from({ length: 3 }, (_, index) => (
      { id: `rw${index}`, type: 'widget', fields: { name: `RW${index}` }, relations: {}, lineage: {}, state: 'draft' }
    ));
    const feedWidgets = Array.from({ length: 3 }, (_, index) => (
      { id: `fw${index}`, type: 'widget', fields: { name: `FW${index}` }, relations: {}, lineage: {}, state: 'draft' }
    ));
    const ref = instance => ({ type: 'widget', id: instance.id });
    const poolFor = feedBRefs => buildInstancePool({
      widgets: [
        { id: 'host', type: 'widget', fields: { name: 'Host' }, relations: {
          reviews: related.map(ref),
          audits: related.map(ref),
          feedA: [ref(feedWidgets[0])],
          feedB: feedBRefs
        }, lineage: {}, state: 'draft' },
        ...related,
        ...feedWidgets
      ]
    });
    const screen = pool => composeScreen(
      { screenKey: 'nt', template: 'home', label: 'NT', typeId: 'widget', scope: { instanceId: 'host' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'reviews_src', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'reviews' } },
          { id: 'audits_src', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'audits' } },
          { id: 'feed_a_src', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'feedA' } },
          { id: 'feed_b_src', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'feedB' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'feedA', slot: 'main', sourceId: 'feed_a_src', surface: 'list' },
          { id: 'feedB', slot: 'main', sourceId: 'feed_b_src', surface: 'list' },
          { id: 'reviews', slot: 'children', sourceId: 'reviews_src', surface: 'card' },
          { id: 'audits', slot: 'children', sourceId: 'audits_src', surface: 'card' }
        ] },
      contract, cardBundle, pool
    );
    // The heavy feedB section (3 preview cards = 14 rows) pushes the
    // section set past the column cap: every step tabs, and the
    // top-level regions' own heavy children stack at every step.
    const heavy = screen(poolFor(feedWidgets.map(ref)));
    expect(heavy.regionsArrangement.wide.mode).toBe('tabs');
    expect(heavy.regionsArrangement.narrow.mode).toBe('tabs');
    expect(heavy.regions[0].childArrangement.wide.mode).toBe('stack');
    expect(heavy.regions[0].childArrangement.narrow.mode).toBe('stack');
    expect(heavy.regions[2].childArrangement.wide.mode).toBe('stack');
    // The same record with an empty feedB stubs that section (inert
    // partition) and arranges the rest; the section ladder keeps its
    // mixed outcome while the record page's own children resolve the
    // document stack at every step (SPEC §22.17).
    const light = screen(poolFor([]));
    expect(light.stubRegions.map(region => region.id)).toEqual(['feedB']);
    expect(light.regionsArrangement.wide.mode).toBe('mixed');
    expect(light.regions[0].childArrangement.wide.mode).toBe('stack');
    expect(light.regions[0].childArrangement.narrow.mode).toBe('stack');
  });

  it('renders the record page as one document stack while list screens keep the ladder', () => {
    // SPEC §22.17: the record presentation resolves the inline stack
    // alone — the side rail, peer columns, and tabs are record-page
    // outcomes no more, at every width step. The peek keeps the ladder,
    // and list screens (screen sections, nested surfaces) still resolve
    // every outcome.
    const cardBundle = { types: bundle.types.map(type => (
      type.id === 'widget' ? { ...type, class: 'file', payload: { mime: ['image/png'], preview: 'image' } } : type
    )) };
    const related = Array.from({ length: 6 }, (_, index) => (
      { id: `rw${index}`, type: 'widget', fields: { name: `RW${index}` }, relations: {}, lineage: {}, state: 'draft' }
    ));
    const pool = buildInstancePool({
      widgets: [
        { id: 'host', type: 'widget', fields: { name: 'Host' }, relations: {
          reviews: related.map(instance => ({ type: 'widget', id: instance.id })),
          audits: related.map(instance => ({ type: 'widget', id: instance.id }))
        }, lineage: {}, state: 'draft' },
        ...related
      ]
    });
    const screen = presentation => composeScreen(
      { screenKey: 'doc', template: 'instanceDetail', label: 'D', typeId: 'widget', scope: { instanceId: 'host' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'reviews_src', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'reviews' } },
          { id: 'audits_src', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'audits' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'reviews', slot: 'children', sourceId: 'reviews_src', surface: 'card' },
          { id: 'audits', slot: 'children', sourceId: 'audits_src', surface: 'card' }
        ] },
      contract, cardBundle, pool,
      presentation ? { presentation } : undefined
    );
    const record = screen();
    for (const step of ['narrow', 'medium', 'wide']) {
      expect(record.regions[0].childArrangement[step]).toEqual({ mode: 'stack' });
    }
    expect(record.regions[0].sideRail).toBe(null);
    const peek = screen('peek');
    expect(peek.regions[0].childArrangement.wide.mode).toBe('tabs');
    expect(peek.regions[0].childArrangement.narrow.mode).toBe('tabs');
  });

  it('keeps empty child collections layout-inert as stubs', () => {
    const host = { id: 'host', type: 'widget', fields: { name: 'Host' }, relations: {
      reviews: [{ type: 'widget', id: 'rw0' }],
      audits: []
    }, lineage: {}, state: 'draft' };
    const filled = { id: 'rw0', type: 'widget', fields: { name: 'RW0' }, relations: {}, lineage: {}, state: 'draft' };
    const relationScreen = pool => composeScreen(
      { screenKey: 'stub', template: 'instanceDetail', label: 'S', typeId: 'widget', scope: { instanceId: 'host' },
        sources: [
          { id: 'widget', typeId: 'widget', mode: 'single' },
          { id: 'widget_reviews_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'reviews' } },
          { id: 'widget_audits_related', typeId: 'widget', mode: 'list', relation: { sourceId: 'widget', key: 'audits' } }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'widget', surface: 'detail' },
          { id: 'reviews', slot: 'children', sourceId: 'widget_reviews_related', surface: 'card' },
          { id: 'audits', slot: 'children', sourceId: 'widget_audits_related', surface: 'card' }
        ] },
      contract, bundle, pool
    );
    // One filled, one empty: the filled child derives the table — a
    // full-breadth layout that claims the row below the body at every
    // step (SPEC §22.15) — while the empty one is a stub claiming no
    // layout.
    const mixed = relationScreen(buildInstancePool({ widgets: [host, filled] }));
    expect(mixed.regions[0].childRegions.map(region => region.relationKey)).toEqual(['reviews']);
    expect(mixed.regions[0].stubRegions.map(region => region.relationKey)).toEqual(['audits']);
    expect(mixed.regions[0].childArrangement.narrow).toEqual({ mode: 'stack' });
    expect(mixed.regions[0].childArrangement.wide).toEqual({ mode: 'stack' });
    expect(mixed.regions[0].sideRail).toBe(null);
    // More rows change nothing about the breadth: the table stays below
    // the body at full width.
    const thinHost = { ...host, relations: { reviews: ['rw0', 'rw1', 'rw2'].map(id => ({ type: 'widget', id })), audits: [] } };
    const thinPool = buildInstancePool({
      widgets: [thinHost,
        ...['rw0', 'rw1', 'rw2'].map(id => ({ id, type: 'widget', fields: { name: id.toUpperCase() }, relations: {}, lineage: {}, state: 'draft' }))]
    });
    const thin = relationScreen(thinPool);
    expect(thin.regions[0].sideRail).toBe(null);
    expect(thin.regions[0].childArrangement.wide).toEqual({ mode: 'stack' });
    // An all-empty child set renders the body full-width with the
    // collections as stubs below.
    const emptyHost = { ...host, relations: { reviews: [], audits: [] } };
    const allEmpty = relationScreen(buildInstancePool({ widgets: [emptyHost] }));
    expect(allEmpty.regions[0].childRegions).toEqual([]);
    expect(allEmpty.regions[0].stubRegions.map(region => region.relationKey)).toEqual(['reviews', 'audits']);
    expect(allEmpty.regions[0].sideRail).toBe(null);
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
    // The identifier field ('name') stays the identity/search axis; sort
    // keys exclude it so no descriptor column repeats the title.
    expect(controls.sortKeys.map(key => key.name)).toEqual(['size']);
    expect(controls.searchKeys).toEqual(['name']);
    expect(controls.pagination.rows).toBe(10);
  });
});

describe('record document sections (SPEC §26 overlays)', () => {
  const DECLARED = ['properties', 'editor', 'relation:linked', 'children:t-part'];

  it('keys child regions by relation, lineage key plus type, then child type', () => {
    expect(recordChildSectionKey({ relationKey: 'linked' })).toBe('relation:linked');
    expect(recordChildSectionKey({ lineageKey: 'documents', typeId: 'doc' })).toBe('children:documents:doc');
    // One edge key carrying several child types keys each section apart.
    expect(recordChildSectionKey({ lineageKey: 'queueId', typeId: 'xlsx-workbook' }))
      .not.toBe(recordChildSectionKey({ lineageKey: 'queueId', typeId: 'queue-entry' }));
    expect(recordChildSectionKey({ typeId: 't-part' })).toBe('children:t-part');
  });

  it('leaves the derivation order untouched without an overlay', () => {
    expect(composeDocumentSections(DECLARED, null))
      .toEqual(DECLARED.map(key => ({ key, block: null })));
  });

  it('applies the authored order, interleaving custom blocks with declared keys', () => {
    const overlay = {
      blocks: [{ id: 'b1', kind: 'text', text: 'Notes' }],
      order: ['b1', 'editor', 'properties']
    };
    expect(composeDocumentSections(DECLARED, overlay).map(section => section.key))
      .toEqual(['b1', 'editor', 'properties', 'relation:linked', 'children:t-part']);
    expect(composeDocumentSections(DECLARED, overlay)[0].block).toEqual({ id: 'b1', kind: 'text', text: 'Notes' });
  });

  it('declared content never deletes: unknown order keys drop, missing declared keys append in derivation order', () => {
    const overlay = {
      blocks: [],
      // 'relation:gone' addresses no current section; 'properties' is
      // absent from the order entirely.
      order: ['relation:gone', 'editor']
    };
    expect(composeDocumentSections(DECLARED, overlay).map(section => section.key))
      .toEqual(['editor', 'properties', 'relation:linked', 'children:t-part']);
  });

  it('appends a stored block its order omits', () => {
    const overlay = {
      blocks: [{ id: 'b2', kind: 'view', view: { id: 'v', name: 'Walls' } }],
      order: ['editor']
    };
    expect(composeDocumentSections(DECLARED, overlay).map(section => section.key))
      .toEqual(['editor', 'properties', 'relation:linked', 'children:t-part', 'b2']);
  });
});
