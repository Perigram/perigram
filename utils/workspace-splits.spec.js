import { describe, expect, it } from 'vitest';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
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

  it('collapses a split when one of its panes closes', () => {
    const root = splitWorkspaceLeaf(
      createWorkspaceLeaf('pane-1', 'project:p1'),
      'pane-1',
      'horizontal',
      createWorkspaceLeaf('pane-2', 'queue:q1')
    );

    expect(closeWorkspaceLeaf(root, 'pane-2')).toEqual(createWorkspaceLeaf('pane-1', 'project:p1'));
  });
});
