import { describe, expect, it } from 'vitest';
import {
  homeWorkspaceStorageKey,
  loadHomeWorkspaceState,
  saveHomeWorkspaceState
} from '~/utils/home-workspace-state.js';
import { normalizeDockLayout, pruneDockLayout } from '~/utils/workspace-dock-layout.js';

function memoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: key => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; }
  };
}

function layoutFixture(views = ['screen:list:doc-1']) {
  return {
    grid: {
      root: {
        type: 'leaf',
        data: { id: 'group-1', views, activeView: views[0] },
        size: 100
      },
      width: 1000,
      height: 800,
      orientation: 'HORIZONTAL'
    },
    panels: {
      'screen:list:doc-1': {
        id: 'screen:list:doc-1',
        contentComponent: 'workspacePanel',
        title: 'Doc'
      }
    },
    activeGroup: 'group-1'
  };
}

describe('home workspace state', () => {
  it('scopes the storage key to the user and organization', () => {
    expect(homeWorkspaceStorageKey({ userId: 'u1', organizationId: 'o1' }))
      .toBe('perigram:home-workspace:4:u1:o1');
    expect(homeWorkspaceStorageKey({ userId: '', organizationId: 'o1' })).toBe('');
    expect(homeWorkspaceStorageKey({ userId: 'u1', organizationId: '' })).toBe('');
  });

  it('round-trips the dock layout, tabs, and opened references', () => {
    const storage = memoryStorage();
    const layout = layoutFixture();
    saveHomeWorkspaceState(storage, 'perigram:home-workspace:4:u1:o1', {
      layout,
      openedEntityRefs: [{ key: 'project:p1', typeId: 'project', instanceId: 'p1' }],
      openedPageRefs: [{ key: 'page:cassette-designer:c1', pageId: 'cassette-designer', typeId: 'cassette', instanceId: 'c1' }],
      openedScreenRefs: [{ key: 'screen:list:doc-1', screenKey: 'list', typeId: 'doc', instanceId: 'doc-1' }],
      openedCustomPageRefs: [{ key: 'page:customPage:page-1', docId: 'page-1' }],
      openedChatRefs: [{ key: 'page:chat:dm:c1', conversationKey: 'dm:c1', label: 'Ada' }],
      sidebarCollapsed: true,
      collapsedSectionKeys: ['page-section:sec-1']
    });

    const state = loadHomeWorkspaceState(storage, 'perigram:home-workspace:4:u1:o1');
    expect(state.layout).toEqual(layout);
    expect(state.sidebarCollapsed).toBe(true);
    expect(state.collapsedSectionKeys).toEqual(['page-section:sec-1']);
    expect(state.openedEntityRefs).toEqual([{ key: 'project:p1', typeId: 'project', instanceId: 'p1' }]);
    expect(state.openedPageRefs).toEqual([{
      key: 'page:cassette-designer:c1',
      pageId: 'cassette-designer',
      typeId: 'cassette',
      instanceId: 'c1'
    }]);
    expect(state.openedCustomPageRefs).toEqual([{ key: 'page:customPage:page-1', docId: 'page-1' }]);
    expect(state.openedChatRefs).toEqual([{ key: 'page:chat:dm:c1', conversationKey: 'dm:c1', label: 'Ada' }]);
  });

  it('reads a version 3 pane tree once and flattens its open tabs', () => {
    const v3Key = 'perigram:home-workspace:3:u1:o1';
    const storage = memoryStorage({
      [v3Key]: JSON.stringify({
        version: 3,
        activePaneId: 'pane-2',
        paneTree: {
          kind: 'split',
          id: 'split:pane-1:pane-2',
          orientation: 'horizontal',
          sizes: [50, 50],
          children: [
            { kind: 'leaf', id: 'pane-1', selectionKey: 'screen:list:doc-1', tabKeys: ['screen:list:doc-1', 'page:customPage:page-1'] },
            { kind: 'leaf', id: 'pane-2', selectionKey: 'page:chat:dm:c1', tabKeys: ['page:chat:dm:c1', 'room-1'] }
          ]
        },
        openedEntityRefs: [],
        openedPageRefs: [],
        openedScreenRefs: [{ key: 'screen:list:doc-1', screenKey: 'list', typeId: 'doc', instanceId: 'doc-1' }]
      })
    });

    const state = loadHomeWorkspaceState(storage, 'perigram:home-workspace:4:u1:o1');
    expect(state.pendingTabKeys).toEqual([
      'screen:list:doc-1',
      'page:customPage:page-1',
      'page:chat:dm:c1',
      'room-1'
    ]);
    expect(state.pendingActiveKey).toBe('page:chat:dm:c1');
    expect(state.openedCustomPageRefs).toEqual([{ key: 'page:customPage:page-1', docId: 'page-1' }]);
    expect(state.openedChatRefs).toEqual([{ key: 'page:chat:dm:c1', conversationKey: 'dm:c1', label: '' }]);
    expect(state.openedScreenRefs).toHaveLength(1);
  });

  it('defaults to an empty state when stored state is missing or corrupt', () => {
    const empty = loadHomeWorkspaceState(memoryStorage(), 'k');
    expect(empty.layout).toBeNull();
    expect(empty.pendingTabKeys).toEqual([]);
    expect(empty.openedScreenRefs).toEqual([]);
    const corrupt = loadHomeWorkspaceState(memoryStorage({ k: '{not json' }), 'k');
    expect(corrupt.layout).toBeNull();
  });
});

describe('workspace dock layout', () => {
  it('rejects shapes dockview cannot restore', () => {
    expect(normalizeDockLayout(null)).toBeNull();
    expect(normalizeDockLayout({ panels: {} })).toBeNull();
    expect(normalizeDockLayout({ grid: { root: { type: 'leaf', data: {} } }, panels: {} })).toBeNull();
  });

  it('prunes unresolved panels and collapses emptied groups', () => {
    const layout = {
      grid: {
        root: {
          type: 'branch',
          data: [
            { type: 'leaf', data: { id: 'g1', views: ['screen:keep', 'screen:drop'], activeView: 'screen:drop' }, size: 50 },
            { type: 'leaf', data: { id: 'g2', views: ['screen:drop'], activeView: 'screen:drop' }, size: 50 }
          ],
          size: 100
        },
        width: 1000,
        height: 800,
        orientation: 'HORIZONTAL'
      },
      panels: {
        'screen:keep': { id: 'screen:keep', contentComponent: 'workspacePanel' },
        'screen:drop': { id: 'screen:drop', contentComponent: 'workspacePanel' }
      },
      activeGroup: 'g2'
    };

    const pruned = pruneDockLayout(layout, key => key === 'screen:keep');
    expect(pruned.grid.root.type).toBe('leaf');
    expect(pruned.grid.root.data).toEqual({ id: 'g1', views: ['screen:keep'], activeView: 'screen:keep' });
    expect(Object.keys(pruned.panels)).toEqual(['screen:keep']);
    expect(pruned.activeGroup).toBe('g1');
  });

  it('returns null when no panel resolves', () => {
    expect(pruneDockLayout(layoutFixture(), () => false)).toBeNull();
  });
});
