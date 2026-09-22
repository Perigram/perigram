import { describe, expect, it } from 'vitest';
import {
  homeWorkspaceStorageKey,
  loadHomeWorkspaceState,
  saveHomeWorkspaceState
} from '~/utils/home-workspace-state.js';
import { emptyTabKey } from '~/utils/workspace-empty-tabs.js';
import { splitWorkspaceLeaf, createWorkspaceLeaf, withPaneTab } from '~/utils/workspace-splits.js';

function memoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: key => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; }
  };
}

describe('home workspace state', () => {
  it('scopes the storage key to the user and organization', () => {
    expect(homeWorkspaceStorageKey({ userId: 'u1', organizationId: 'o1' }))
      .toBe('cutkit:home-workspace:2:u1:o1');
    expect(homeWorkspaceStorageKey({ userId: '', organizationId: 'o1' })).toBe('');
    expect(homeWorkspaceStorageKey({ userId: 'u1', organizationId: '' })).toBe('');
  });

  it('round-trips pane tree, tabs, and opened references', () => {
    const storage = memoryStorage();
    const paneTree = splitWorkspaceLeaf(
      createWorkspaceLeaf('pane-1', 'project:p1'),
      'pane-1',
      'horizontal',
      createWorkspaceLeaf('pane-2')
    );
    saveHomeWorkspaceState(storage, 'cutkit:home-workspace:1:u1:o1', {
      paneTree,
      activePaneId: 'pane-2',
      paneSequence: 2,
      openedEntityRefs: [{ key: 'project:p1', typeId: 'project', instanceId: 'p1' }],
      openedPageRefs: [{ key: 'page:cassette-designer:c1', pageId: 'cassette-designer', typeId: 'cassette', instanceId: 'c1' }]
    });

    const state = loadHomeWorkspaceState(storage, 'cutkit:home-workspace:1:u1:o1');
    expect(state.paneTree.kind).toBe('split');
    expect(state.paneTree.children[0].tabKeys).toEqual(['project:p1']);
    expect(state.activePaneId).toBe('pane-2');
    expect(state.paneSequence).toBe(2);
    expect(state.openedEntityRefs).toEqual([{ key: 'project:p1', typeId: 'project', instanceId: 'p1' }]);
    expect(state.openedPageRefs).toEqual([{
      key: 'page:cassette-designer:c1',
      pageId: 'cassette-designer',
      typeId: 'cassette',
      instanceId: 'c1'
    }]);
  });

  it('normalizes invalid or missing stored state back to a single empty pane', () => {
    expect(loadHomeWorkspaceState(memoryStorage(), 'k').paneTree)
      .toEqual(createWorkspaceLeaf('pane-1'));
    const corrupted = memoryStorage({ k: '{not json' });
    expect(loadHomeWorkspaceState(corrupted, 'k').paneTree)
      .toEqual(createWorkspaceLeaf('pane-1'));
    expect(loadHomeWorkspaceState(null, 'k').paneTree)
      .toEqual(createWorkspaceLeaf('pane-1'));
  });

  it('drops explorer fields from the persisted home shape', () => {
    const storage = memoryStorage();
    saveHomeWorkspaceState(storage, 'k', {
      paneTree: createWorkspaceLeaf('pane-1'),
      activePaneId: 'pane-1',
      paneSequence: 1,
      openedEntityRefs: [],
      openedPageRefs: [],
      explorerOpen: false,
      explorerSize: 40
    });
    expect(JSON.parse(storage.getItem('k'))).not.toHaveProperty('explorerOpen');
    expect(JSON.parse(storage.getItem('k'))).not.toHaveProperty('explorerSize');
  });
});

describe('workspace pane tabs', () => {
  it('reuses the selected tab for new content instead of appending', () => {
    const pane = { selectionKey: 'project:p1', tabKeys: ['project:p1', 'queue:q1'] };
    // The opened item takes the selected tab's slot in place.
    expect(withPaneTab(pane, 'queue:q2')).toEqual(['queue:q2', 'queue:q1']);
    expect(withPaneTab({ ...pane, selectionKey: 'queue:q1' }, 'queue:q2')).toEqual(['project:p1', 'queue:q2']);
  });

  it('replaces an empty placeholder like any other content', () => {
    const empty = emptyTabKey();
    const pane = { selectionKey: empty, tabKeys: [empty] };
    expect(withPaneTab(pane, 'project:p1')).toEqual(['project:p1']);
  });

  it('keeps tabs unchanged when the item already has one and appends explicit new tabs', () => {
    const pane = { selectionKey: 'project:p1', tabKeys: ['project:p1', 'queue:q1'] };
    expect(withPaneTab(pane, 'queue:q1')).toEqual(['project:p1', 'queue:q1']);
    expect(withPaneTab(pane, 'queue:q2', { newTab: true })).toEqual(['project:p1', 'queue:q1', 'queue:q2']);
    const withEmpty = withPaneTab(pane, emptyTabKey());
    expect(withEmpty.slice(0, 2)).toEqual(['project:p1', 'queue:q1']);
    expect(withEmpty[2]).toMatch(/^empty:/);
  });

  it('appends the first content of an empty pane', () => {
    expect(withPaneTab(createWorkspaceLeaf('pane-1'), 'project:p1'))
      .toEqual(['project:p1']);
  });
});
