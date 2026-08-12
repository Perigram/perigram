import { describe, expect, it, vi } from 'vitest';

vi.mock('~/composables/useGeneratedScreen.js', () => ({
  resolveSourceFilters: (source, screen) => Object.fromEntries(Object.entries(source.filters || {}).map(([key, value]) => [
    key,
    value === '$screen.scope.entityId' ? screen.scope.entityId : value
  ]))
}));

import { linkedExplorerChildSources } from './project-linked-child-sources.js';

describe('linked project child sources', () => {
  it('loads a linked library from its declared cassette child source', () => {
    expect(linkedExplorerChildSources({
      linkedItems: [{ key: 'library:library-1', type: 'library', entity: { _id: 'library-1' } }],
      screens: [{
        template: 'entityDetail',
        sources: [
          { id: 'library', entityType: 'library', mode: 'single' },
          { id: 'cassettes', entityType: 'cassette', mode: 'list', filters: { libraryId: '$screen.scope.entityId' } }
        ]
      }],
      containment: [{ parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }]
    })).toEqual([{
      parentKey: 'library:library-1',
      entityType: 'cassette',
      filters: { libraryId: 'library-1' }
    }]);
  });
});
