import { describe, expect, it } from 'vitest';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
  pruneLeafTabs,
  splitWorkspaceLeaf,
  updateWorkspaceLeaf,
  updateWorkspaceSplit,
  workspaceLeaves
} from './workspace-splits.js';

describe('workspace split tree', () => {
  it('nests horizontal and vertical splits around the targeted leaf', () => {
    const first = createWorkspaceLeaf('pane-1', 'project:p1');
    const horizontal = splitWorkspaceLeaf(first, 'pane-1', 'horizontal', createWorkspaceLeaf('pane-2', 'queue:q1'));
    const nested = splitWorkspaceLeaf(horizontal, 'pane-2', 'vertical', createWorkspaceLeaf('pane-3', 'sheet:s1'));

    expect(nested.orientation).toBe('horizontal');
    expect(nested.sizes).toEqual([50, 50]);
    expect(nested.children[1].orientation).toBe('vertical');
    expect(workspaceLeaves(nested).map(pane => pane.id)).toEqual(['pane-1', 'pane-2', 'pane-3']);
  });

  it('updates only the resized split proportions', () => {
    const root = splitWorkspaceLeaf(
      createWorkspaceLeaf('pane-1'),
      'pane-1',
      'horizontal',
      createWorkspaceLeaf('pane-2')
    );

    expect(updateWorkspaceSplit(root, root.id, [30, 70]).sizes).toEqual([30, 70]);
  });

  it('updates one pane selection without changing its siblings', () => {
    const root = splitWorkspaceLeaf(
      createWorkspaceLeaf('pane-1', 'project:p1'),
      'pane-1',
      'horizontal',
      createWorkspaceLeaf('pane-2', 'queue:q1')
    );

    const updated = updateWorkspaceLeaf(root, 'pane-2', { selectionKey: 'queue:q2' });

    expect(workspaceLeaves(updated).map(pane => pane.selectionKey)).toEqual(['project:p1', 'queue:q2']);
  });

  it('initializes a selected leaf with one open tab', () => {
    expect(createWorkspaceLeaf('pane-1', 'project:p1')).toEqual({
      kind: 'leaf',
      id: 'pane-1',
      selectionKey: 'project:p1',
      tabKeys: ['project:p1']
    });
  });

  it('collapses a split when one of its panes closes', () => {
    const root = splitWorkspaceLeaf(
      createWorkspaceLeaf('pane-1', 'project:p1'),
      'pane-1',
      'horizontal',
      createWorkspaceLeaf('pane-2', 'queue:q1')
    );

    expect(closeWorkspaceLeaf(root, 'pane-2')).toEqual(createWorkspaceLeaf('pane-1', 'project:p1'));
  });

  it('closes tabs whose content died and resets a fully dead leaf to one empty tab', () => {
    const keep = createWorkspaceLeaf('pane-1', 'screen:s1');
    keep.tabKeys = ['screen:s1', 'screen:gone', 'page:p1'];
    const pruned = pruneLeafTabs(keep, new Set(['screen:s1', 'page:p1']), key => key.startsWith('empty:'));
    expect(pruned.tabKeys).toEqual(['screen:s1', 'page:p1']);
    expect(pruned.selectionKey).toBe('screen:s1');

    const dead = pruneLeafTabs(keep, new Set([]), key => key.startsWith('empty:'));
    expect(dead.tabKeys).toHaveLength(1);
    expect(dead.tabKeys[0]).toMatch(/^empty:/);
    expect(dead.selectionKey).toBe(dead.tabKeys[0]);
  });
});
