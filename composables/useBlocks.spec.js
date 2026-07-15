import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useLineage } from './useBlocks.js';

describe('useLineage', () => {
  it('reads structured and revision-qualified ancestor references', () => {
    const entity = ref({
      lineage: {
        queue: { entityType: 'queue', entityId: 'queue-1', revisionId: 'revision-2' }
      }
    });
    const { getAncestorReference, getAncestorId } = useLineage(entity);

    expect(getAncestorId('queue')).toBe('queue-1');
    expect(getAncestorReference('queue')).toEqual({
      entityType: 'queue',
      entityId: 'queue-1',
      revisionId: 'revision-2'
    });
  });

  it('does not accept legacy flat lineage ids', () => {
    const { getAncestorId } = useLineage(ref({ lineage: { queueId: 'legacy-queue' } }));

    expect(getAncestorId('queue')).toBeUndefined();
  });
});
