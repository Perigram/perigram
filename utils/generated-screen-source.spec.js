import { describe, expect, it } from 'vitest';
import { filterRootSourceItems, shouldRenderHomeSection } from './generated-screen-source.js';

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
