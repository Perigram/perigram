import { describe, expect, it } from 'vitest';
import { entityMatchesFilters, filterRootSourceItems, shouldRenderHomeSection, typeParentOf } from './generated-screen-source.js';

describe('generated screen root sources', () => {
  const bindings = (...rows) => rows.map(([parentTypeId, childTypeId, lineageKey]) => ({
    parentTypeId,
    childTypeId,
    lineageKey
  }));

  it('keeps only entities without any declared containment parent', () => {
    const root = { _id: 'root', lineage: {} };
    const designChild = { _id: 'design-child', lineage: { sheetDesignId: 'design-1' } };
    const pileChild = { _id: 'pile-child', lineage: { pileId: 'pile-1' } };

    expect(filterRootSourceItems(
      [root, designChild, pileChild],
      { typeId: 'sheet', lineageBindings: bindings(['sheet_design', 'sheet', 'sheetDesignId'], ['material_pile', 'sheet', 'pileId']) },
      {
        designs: { source: { typeId: 'sheet_design', mode: 'list' }, items: [{ _id: 'design-1' }] },
        piles: { source: { typeId: 'material_pile', mode: 'list' }, items: [{ _id: 'pile-1' }] }
      }
    )).toEqual([root]);
  });

  it('keeps a child as top-level when its parent is not readable', () => {
    const child = { _id: 'child', lineage: { projectId: 'hidden-project' } };
    expect(filterRootSourceItems(
      [child],
      { typeId: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) },
      { queues: { source: { typeId: 'queue', mode: 'list' }, items: [child] } }
    )).toEqual([child]);
  });

  // The instance store normalizes every lineage ref to the `{ id }`
  // object shape (dtoToScreenInstance); a reader that String()s the raw
  // slot turns the ref into "[object Object]" and never matches a loaded
  // parent — recursive children then stay in the home section's top-level
  // rows beside their nested copies.
  it('filters recursive children whose parent refs ride the { id } object shape', () => {
    const parent = { _id: 'folder-1', lineage: {} };
    const child = { _id: 'folder-2', lineage: { folderId: { id: 'folder-1' } } };
    const grandchild = { _id: 'folder-3', lineage: { folderId: { type: 'folder', id: 'folder-2' } } };
    expect(filterRootSourceItems(
      [parent, child, grandchild],
      { typeId: 'folder', lineageBindings: bindings(['folder', 'folder', 'folderId']) },
      { folders: { source: { typeId: 'folder', mode: 'list' }, items: [parent, child, grandchild] } }
    )).toEqual([parent]);
  });

  it('keeps an object-ref child whose parent is not loaded (root of the loaded view)', () => {
    const child = { _id: 'folder-9', lineage: { folderId: { id: 'unloaded-folder' } } };
    expect(filterRootSourceItems(
      [child],
      { typeId: 'folder', lineageBindings: bindings(['folder', 'folder', 'folderId']) },
      { folders: { source: { typeId: 'folder', mode: 'list' }, items: [child] } }
    )).toEqual([child]);
  });

  it('filters cross-type children whose parent ref rides the object shape', () => {
    const project = { _id: 'project-1', lineage: {} };
    const queue = { _id: 'queue-1', lineage: { projectId: { id: 'project-1' } } };
    expect(filterRootSourceItems(
      [queue],
      { typeId: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) },
      {
        projects: { source: { typeId: 'project', mode: 'list' }, items: [project] },
        queues: { source: { typeId: 'queue', mode: 'list' }, items: [queue] }
      }
    )).toEqual([]);
  });

  it('derives containment for already-compiled home manifests without root lineage keys', () => {
    const project = { _id: 'project-1', lineage: { organizationId: 'org-1' } };
    const queue = { _id: 'queue-1', lineage: { organizationId: 'org-1', projectId: 'project-1' } };
    expect(filterRootSourceItems(
      [queue],
      { typeId: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) },
      {
        projects: { source: { typeId: 'project', mode: 'list' }, items: [project] },
        queues: { source: { typeId: 'queue', mode: 'list' }, items: [queue] }
      }
    )).toEqual([]);
  });

  it('hides a descendant when a readable indirect ancestor is present', () => {
    const project = { _id: 'project-1', lineage: { organizationId: 'org-1' } };
    const sheet = {
      _id: 'sheet-1',
      lineage: { organizationId: 'org-1', projectId: 'project-1', queueId: 'queue-1', sheetDesignId: 'design-1' }
    };
    expect(filterRootSourceItems(
      [sheet],
      { typeId: 'sheet', lineageBindings: bindings(
        ['project', 'queue', 'projectId'],
        ['queue', 'sheet_design', 'queueId'],
        ['sheet_design', 'sheet', 'sheetDesignId']
      ) },
      {
        projects: { source: { typeId: 'project', mode: 'list' }, items: [project] },
        sheets: { source: { typeId: 'sheet', mode: 'list' }, items: [sheet] }
      }
    )).toEqual([]);
  });

  it('does not infer hierarchy from arbitrary lineage keys without a compiled binding', () => {
    const library = { _id: 'library-1', lineage: { organizationId: 'org-1' } };
    const design = { _id: 'design-1', lineage: { organizationId: 'org-1', libraryId: 'library-1' } };
    expect(filterRootSourceItems(
      [design],
      { typeId: 'cassette_design' },
      {
        libraries: { source: { typeId: 'library', mode: 'list' }, items: [library] },
        designs: { source: { typeId: 'cassette_design', mode: 'list' }, items: [design] }
      },
      []
    )).toEqual([design]);
  });

  it('removes empty child sections but retains empty top-level creation sections', () => {
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [],
      source: { typeId: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) }
    })).toBe(false);
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [{ _id: 'design-1', lineage: { libraryId: 'library-1' } }],
      source: { typeId: 'cassette_design', lineageBindings: bindings(['cassette', 'cassette_design', 'templateId']) }
    })).toBe(false);
    expect(shouldRenderHomeSection({
      items: [{ _id: 'design-1', lineage: { templateId: 'cassette-1' } }],
      rawItems: [{ _id: 'design-1', lineage: { templateId: 'cassette-1' } }],
      source: { typeId: 'cassette_design', lineageBindings: bindings(['cassette', 'cassette_design', 'templateId']) }
    })).toBe(false);
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [],
      source: { typeId: 'project', lineageBindings: [] }
    })).toBe(true);
  });

  it('supports arbitrary compiled entity types without a registry row', () => {
    const child = { _id: 'leaf-1', lineage: { branchRef: 'root-1' } };
    expect(filterRootSourceItems(
      [child],
      { typeId: 'synthetic_leaf', lineageBindings: bindings(['synthetic_root', 'synthetic_leaf', 'branchRef']) },
      {
        roots: { source: { typeId: 'synthetic_root', mode: 'list' }, items: [{ _id: 'root-1' }] },
        leaves: { source: { typeId: 'synthetic_leaf', mode: 'list' }, items: [child] }
      }
    )).toEqual([]);
  });
});

describe('entityMatchesFilters (wire reconciliation of source filters)', () => {
  // The compiled parent-detail child region carries a list source filtered
  // by the declared lineage key against the screen scope. Wire DTOs store
  // that ref at lineage.<key>; a bare filter key must read through the
  // lineage block so created children reconcile into the open region.
  it('matches a child whose declared lineage key points at the opened parent', () => {
    expect(entityMatchesFilters(
      { _id: 'panel-1', type: 'panel', lineage: { binId: 'bin-1' } },
      { binId: 'bin-1' }
    )).toBe(true);
  });

  it('rejects a child of another parent and a parentless child', () => {
    expect(entityMatchesFilters(
      { _id: 'panel-2', type: 'panel', lineage: { binId: 'bin-2' } },
      { binId: 'bin-1' }
    )).toBe(false);
    expect(entityMatchesFilters({ _id: 'panel-3', type: 'panel', lineage: {} }, { binId: 'bin-1' })).toBe(false);
  });

  it('still honors dotted filter paths over the wire DTO', () => {
    expect(entityMatchesFilters({ lineage: { binId: 'bin-1' } }, { 'lineage.binId': 'bin-1' })).toBe(true);
    expect(entityMatchesFilters({ lineage: { binId: 'bin-2' } }, { 'lineage.binId': 'bin-1' })).toBe(false);
  });

  it('keeps status window filters on the flat state', () => {
    expect(entityMatchesFilters(
      { state: 'installed', lineage: { binId: 'bin-1' } },
      { primaryStates: 'available,installed', binId: 'bin-1' }
    )).toBe(true);
    expect(entityMatchesFilters(
      { state: 'gone', lineage: { binId: 'bin-1' } },
      { primaryStates: 'available,installed', binId: 'bin-1' }
    )).toBe(false);
    expect(entityMatchesFilters({ state: 'available' }, { primaryState: 'available' })).toBe(true);
  });
});

describe('typeParentOf — recursive containment never roots the type node', () => {
  it('a self-pair maps no parent, so the recursive type stays a root', () => {
    const parentOf = typeParentOf([
      { childType: 'assembly', parentType: 'assembly', lineageKey: 'assemblyId' },
      { childType: 'sheet', parentType: 'assembly', lineageKey: 'sheetId' }
    ]);
    expect(parentOf.get('assembly')).toBeUndefined();
    expect(parentOf.get('sheet')).toBe('assembly');
    // The explorer rooting this feeds: only foreign children root.
    const rooted = new Set([...parentOf.entries()].filter(([, parent]) => parent).map(([child]) => child));
    expect(rooted.has('assembly')).toBe(false);
    expect(rooted.has('sheet')).toBe(true);
  });
});
