import { describe, expect, it } from 'vitest';
import {
  loadProjectWorkspaceState,
  normalizeProjectWorkspaceState,
  projectWorkspaceStorageKey,
  saveProjectWorkspaceState
} from './project-workspace-state.js';

describe('project workspace state', () => {
  it('scopes storage to the user, organization, and project', () => {
    expect(projectWorkspaceStorageKey({
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1'
    })).toBe('perigram:project-workspace:4:user-1:org-1:project-1');
    expect(projectWorkspaceStorageKey({ userId: '', organizationId: 'org-1', projectId: 'project-1' })).toBe('');
  });

  it('normalizes invalid persisted trees to one empty pane', () => {
    expect(normalizeProjectWorkspaceState({
      paneTree: { kind: 'split', id: 'broken', children: [] },
      activePaneId: 'missing',
      explorerSize: 99
    })).toMatchObject({
      paneTree: { kind: 'leaf', id: 'pane-1', selectionKey: '', tabKeys: [] },
      activePaneId: 'pane-1',
      explorerSize: 40
    });
  });

  it('keeps the selected file in a normalized pane tab set', () => {
    expect(normalizeProjectWorkspaceState({
      paneTree: { kind: 'leaf', id: 'pane-1', selectionKey: 'queue:q1', tabKeys: ['project:p1'] }
    }).paneTree).toEqual({
      kind: 'leaf',
      id: 'pane-1',
      selectionKey: 'queue:q1',
      tabKeys: ['project:p1', 'queue:q1']
    });
  });

  it('round-trips pane selections, split sizes, and opened pages', () => {
    const values = new Map();
    const storage = {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    };
    const state = {
      paneTree: {
        kind: 'split',
        id: 'split:pane-1:pane-2',
        orientation: 'horizontal',
        sizes: [35, 65],
        children: [
          { kind: 'leaf', id: 'pane-1', selectionKey: 'project:p1', tabKeys: ['project:p1'] },
          { kind: 'leaf', id: 'pane-2', selectionKey: 'page:cassette-designer:c1', tabKeys: ['cassette:c1', 'page:cassette-designer:c1'] }
        ]
      },
      activePaneId: 'pane-2',
      paneSequence: 2,
      explorerOpen: false,
      explorerSize: 18,
      openedEntityRefs: [{
        key: 'cassette:c1',
        typeId: 'cassette',
        instanceId: 'c1'
      }],
      openedPageRefs: [{
        key: 'page:cassette-designer:c1',
        pageId: 'cassette-designer',
        typeId: 'cassette',
        instanceId: 'c1'
      }],
      openedScreenRefs: []
    };

    saveProjectWorkspaceState(storage, 'workspace', state);

    expect(loadProjectWorkspaceState(storage, 'workspace')).toEqual(state);
  });
});
