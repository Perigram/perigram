import { describe, expect, it } from 'vitest';
import { createWorkspaceLeaf, splitWorkspaceLeaf, workspaceLeaves } from '~/utils/workspace-splits.js';
import { loadProjectWorkspaceState, saveProjectWorkspaceState } from '~/utils/project-workspace-state.js';
import { generatedEntityDetailConsumesAction } from './detail-action-ownership.js';

describe('generated project workspace behavior', () => {
  it('starts empty and creates recursively splittable panes only through explicit selection', () => {
    const first = createWorkspaceLeaf('pane-1');
    const tree = splitWorkspaceLeaf(first, 'pane-1', 'horizontal', createWorkspaceLeaf('pane-2', 'artifact:a1'));
    expect(first.selectionKey).toBe('');
    expect(workspaceLeaves(tree).map(pane => pane.selectionKey)).toEqual(['', 'artifact:a1']);
  });

  it('round-trips versioned per-project pane state', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const state = {
      version: 2,
      activePaneId: 'pane-1',
      explorerOpen: true,
      paneTree: createWorkspaceLeaf('pane-1', 'project:p1'),
      paneTabs: { 'pane-1': ['project:p1'] }
    };
    saveProjectWorkspaceState(storage, 'project:p1', state);
    expect(loadProjectWorkspaceState(storage, 'project:p1')).toEqual(expect.objectContaining({
      activePaneId: 'pane-1',
      explorerOpen: true,
      paneTree: expect.objectContaining({ id: 'pane-1', selectionKey: 'project:p1', tabKeys: ['project:p1'] })
    }));
  });

  it('keeps entity actions in the entity/detail body according to one ownership rule', () => {
    expect(generatedEntityDetailConsumesAction('queue', { actionKind: 'updateEntity', entityType: 'queue' })).toBe(true);
    expect(generatedEntityDetailConsumesAction('artifact', { actionKind: 'updateEntity', entityType: 'artifact' })).toBe(false);
    expect(generatedEntityDetailConsumesAction('project', { actionKind: 'createEntity', entityType: 'artifact', parentEntityType: 'project' })).toBe(false);
  });
});
