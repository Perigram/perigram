import { describe, expect, it, vi } from 'vitest';

vi.mock('~/composables/useGeneratedScreen.js', () => ({
  resolveSourceFilters: (source, screen) => Object.fromEntries(Object.entries(source.filters || {}).map(([key, value]) => [
    key,
    value === '$screen.scope.instanceId' ? screen.scope.instanceId : value
  ]))
}));

import { linkedExplorerChildSources } from './project-linked-child-sources.js';

describe('linked project child sources', () => {
  it('loads a linked library from its declared cassette child source', () => {
    expect(linkedExplorerChildSources({
      linkedItems: [{ key: 'library:library-1', type: 'library', entity: { _id: 'library-1' } }],
      screens: [{
        template: 'instanceDetail',
        sources: [
          { id: 'library', typeId: 'library', mode: 'single' },
          { id: 'cassettes', typeId: 'cassette', mode: 'list', filters: { libraryId: '$screen.scope.instanceId' } }
        ]
      }],
      containment: [{ parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }]
    })).toEqual([{
      parentKey: 'library:library-1',
      typeId: 'cassette',
      filters: { libraryId: 'library-1' }
    }]);
  });
});
