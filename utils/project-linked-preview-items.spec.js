import { describe, expect, it } from 'vitest';
import { linkedExplorerPreviewRefs } from './project-linked-preview-items.js';

describe('linked project Explorer previews', () => {
  it('uses only typed summary previews that match declared containment', () => {
    const refs = linkedExplorerPreviewRefs({
      linkedItems: [{
        type: 'library',
        entity: {
          summary: {
            cassettePreview: [{ entityType: 'cassette', id: 'cassette-1' }],
            unrelatedPreview: [{ entityType: 'queue', id: 'queue-1' }]
          }
        }
      }],
      containment: [{ parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }]
    });

    expect(refs).toEqual([{ entityType: 'cassette', id: 'cassette-1', entity: null }]);
  });
});
