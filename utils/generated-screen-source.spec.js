import { describe, expect, it } from 'vitest';
import { filterRootSourceItems } from './generated-screen-source.js';

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
});
