import { describe, expect, it } from 'vitest';
import { filterRootSourceItems, shouldRenderHomeSection } from './generated-screen-source.js';

describe('generated screen root sources', () => {
  const bindings = (...rows) => rows.map(([ancestorEntityType, childEntityType, lineageKey]) => ({
    ancestorEntityType,
    childEntityType,
    lineageKey
  }));

  it('keeps only entities without any declared containment parent', () => {
    const root = { _id: 'root', lineage: {} };
    const designChild = { _id: 'design-child', lineage: { sheetDesignId: 'design-1' } };
    const pileChild = { _id: 'pile-child', lineage: { pileId: 'pile-1' } };

    expect(filterRootSourceItems(
      [root, designChild, pileChild],
      { entityType: 'sheet', lineageBindings: bindings(['sheet_design', 'sheet', 'sheetDesignId'], ['material_pile', 'sheet', 'pileId']) },
      {
        designs: { source: { entityType: 'sheet_design', mode: 'list' }, items: [{ _id: 'design-1' }] },
        piles: { source: { entityType: 'material_pile', mode: 'list' }, items: [{ _id: 'pile-1' }] }
      }
    )).toEqual([root]);
  });

  it('keeps a child as top-level when its parent is not readable', () => {
    const child = { _id: 'child', lineage: { projectId: 'hidden-project' } };
    expect(filterRootSourceItems(
      [child],
      { entityType: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) },
      { queues: { source: { entityType: 'queue', mode: 'list' }, items: [child] } }
    )).toEqual([child]);
  });

  it('derives containment for already-compiled home manifests without root lineage keys', () => {
    const project = { _id: 'project-1', lineage: { organizationId: 'org-1' } };
    const queue = { _id: 'queue-1', lineage: { organizationId: 'org-1', projectId: 'project-1' } };
    expect(filterRootSourceItems(
      [queue],
      { entityType: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) },
      {
        projects: { source: { entityType: 'project', mode: 'list' }, items: [project] },
        queues: { source: { entityType: 'queue', mode: 'list' }, items: [queue] }
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
      { entityType: 'sheet', lineageBindings: bindings(
        ['project', 'queue', 'projectId'],
        ['queue', 'sheet_design', 'queueId'],
        ['sheet_design', 'sheet', 'sheetDesignId']
      ) },
      {
        projects: { source: { entityType: 'project', mode: 'list' }, items: [project] },
        sheets: { source: { entityType: 'sheet', mode: 'list' }, items: [sheet] }
      }
    )).toEqual([]);
  });

  it('does not infer hierarchy from arbitrary lineage keys without a compiled binding', () => {
    const library = { _id: 'library-1', lineage: { organizationId: 'org-1' } };
    const design = { _id: 'design-1', lineage: { organizationId: 'org-1', libraryId: 'library-1' } };
    expect(filterRootSourceItems(
      [design],
      { entityType: 'cassette_design' },
      {
        libraries: { source: { entityType: 'library', mode: 'list' }, items: [library] },
        designs: { source: { entityType: 'cassette_design', mode: 'list' }, items: [design] }
      },
      []
    )).toEqual([design]);
  });

  it('removes empty child sections but retains empty top-level creation sections', () => {
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [],
      source: { entityType: 'queue', lineageBindings: bindings(['project', 'queue', 'projectId']) }
    })).toBe(false);
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [{ _id: 'design-1', lineage: { libraryId: 'library-1' } }],
      source: { entityType: 'cassette_design', lineageBindings: bindings(['cassette', 'cassette_design', 'templateId']) }
    })).toBe(false);
    expect(shouldRenderHomeSection({
      items: [{ _id: 'design-1', lineage: { templateId: 'cassette-1' } }],
      rawItems: [{ _id: 'design-1', lineage: { templateId: 'cassette-1' } }],
      source: { entityType: 'cassette_design', lineageBindings: bindings(['cassette', 'cassette_design', 'templateId']) }
    })).toBe(false);
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [],
      source: { entityType: 'project', lineageBindings: [] }
    })).toBe(true);
  });

  it('supports arbitrary compiled entity types without a registry row', () => {
    const child = { _id: 'leaf-1', lineage: { branchRef: 'root-1' } };
    expect(filterRootSourceItems(
      [child],
      { entityType: 'synthetic_leaf', lineageBindings: bindings(['synthetic_root', 'synthetic_leaf', 'branchRef']) },
      {
        roots: { source: { entityType: 'synthetic_root', mode: 'list' }, items: [{ _id: 'root-1' }] },
        leaves: { source: { entityType: 'synthetic_leaf', mode: 'list' }, items: [child] }
      }
    )).toEqual([]);
  });
});
