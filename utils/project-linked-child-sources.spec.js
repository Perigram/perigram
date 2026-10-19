import { describe, expect, it } from 'vitest';

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
