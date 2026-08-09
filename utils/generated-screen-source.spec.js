import { describe, expect, it } from 'vitest';
import { filterRootSourceItems, shouldRenderHomeSection } from './generated-screen-source.js';

describe('generated screen root sources', () => {
  it('keeps only entities without any declared containment parent', () => {
    const root = { _id: 'root', lineage: {} };
    const designChild = { _id: 'design-child', lineage: { sheetDesignId: 'design-1' } };
    const pileChild = { _id: 'pile-child', lineage: { pileId: 'pile-1' } };

    expect(filterRootSourceItems(
      [root, designChild, pileChild],
      { entityType: 'sheet', rootLineageKeys: ['sheetDesignId', 'pileId'] },
      {
        designs: { source: { entityType: 'sheet_design', mode: 'list' }, items: [{ _id: 'design-1' }] },
        piles: { source: { entityType: 'material_pile', mode: 'list' }, items: [{ _id: 'pile-1' }] }
      },
      [
        { parentType: 'sheet_design', childType: 'sheet', lineageKey: 'sheetDesignId' },
        { parentType: 'material_pile', childType: 'sheet', lineageKey: 'pileId' }
      ]
    )).toEqual([root]);
  });

  it('keeps a child as top-level when its parent is not readable', () => {
    const child = { _id: 'child', lineage: { projectId: 'hidden-project' } };
    expect(filterRootSourceItems(
      [child],
      { entityType: 'queue', rootLineageKeys: ['projectId'] },
      { queues: { source: { entityType: 'queue', mode: 'list' }, items: [child] } },
      [{ parentType: 'project', childType: 'queue', lineageKey: 'projectId' }]
    )).toEqual([child]);
  });

  it('derives containment for already-compiled home manifests without root lineage keys', () => {
    const project = { _id: 'project-1', lineage: { organizationId: 'org-1' } };
    const queue = { _id: 'queue-1', lineage: { organizationId: 'org-1', projectId: 'project-1' } };
    expect(filterRootSourceItems(
      [queue],
      { entityType: 'queue' },
      {
        projects: { source: { entityType: 'project', mode: 'list' }, items: [project] },
        queues: { source: { entityType: 'queue', mode: 'list' }, items: [queue] }
      },
      [{ parentType: 'project', childType: 'queue', lineageKey: 'projectId' }]
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
      { entityType: 'sheet' },
      {
        projects: { source: { entityType: 'project', mode: 'list' }, items: [project] },
        sheets: { source: { entityType: 'sheet', mode: 'list' }, items: [sheet] }
      },
      [
        { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
        { parentType: 'queue', childType: 'sheet_design', lineageKey: 'queueId' },
        { parentType: 'sheet_design', childType: 'sheet', lineageKey: 'sheetDesignId' }
      ]
    )).toEqual([]);
  });

  it('uses canonical lineage keys even when containment metadata omits the relation', () => {
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
    )).toEqual([]);
  });

  it('removes empty child sections but retains empty top-level creation sections', () => {
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [],
      source: { entityType: 'queue', rootLineageKeys: ['projectId'] }
    }, [{ parentType: 'project', childType: 'queue', lineageKey: 'projectId' }])).toBe(false);
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [{ _id: 'design-1', lineage: { libraryId: 'library-1' } }],
      source: { entityType: 'cassette_design' }
    }, [{ parentType: 'cassette', childType: 'cassette_design', lineageKey: 'templateId' }])).toBe(false);
    expect(shouldRenderHomeSection({
      items: [{ _id: 'design-1', lineage: { templateId: 'cassette-1' } }],
      rawItems: [{ _id: 'design-1', lineage: { templateId: 'cassette-1' } }],
      source: { entityType: 'cassette_design' }
    }, [{ parentType: 'cassette', childType: 'cassette_design', lineageKey: 'templateId' }])).toBe(false);
    expect(shouldRenderHomeSection({
      items: [],
      rawItems: [],
      source: { entityType: 'project', rootLineageKeys: [] }
    })).toBe(true);
  });
});
