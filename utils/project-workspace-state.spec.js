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
    })).toBe('cutkit:project-workspace:1:user-1:org-1:project-1');
    expect(projectWorkspaceStorageKey({ userId: '', organizationId: 'org-1', projectId: 'project-1' })).toBe('');
  });

  it('normalizes invalid persisted trees to one empty pane', () => {
    expect(normalizeProjectWorkspaceState({
      paneTree: { kind: 'split', id: 'broken', children: [] },
      activePaneId: 'missing',
      explorerSize: 99
    })).toMatchObject({
      paneTree: { kind: 'leaf', id: 'pane-1', selectionKey: '' },
      activePaneId: 'pane-1',
      explorerSize: 40
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
          { kind: 'leaf', id: 'pane-1', selectionKey: 'project:p1' },
          { kind: 'leaf', id: 'pane-2', selectionKey: 'page:cassette-designer:c1' }
        ]
      },
      activePaneId: 'pane-2',
      paneSequence: 2,
      explorerOpen: false,
      explorerSize: 18,
      openedPageRefs: [{
        key: 'page:cassette-designer:c1',
        pageId: 'cassette-designer',
        entityType: 'cassette',
        entityId: 'c1'
      }]
    };

    saveProjectWorkspaceState(storage, 'workspace', state);

    expect(loadProjectWorkspaceState(storage, 'workspace')).toEqual(state);
  });
});
