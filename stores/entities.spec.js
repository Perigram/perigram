import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEntityStore } from './entities.js';
import { emitEntityCreated, emitEntityDeleted, emitEntityUpdated } from '~/utils/entity-events.js';

describe('entity store sync listener', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('window', new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('upserts and removes entities from the registry when shared sync events fire', () => {
    const store = useEntityStore();

    emitEntityCreated({ type: 'project', entity: { _id: 'project-1', identity: { name: 'Created' } } });
    expect(store.registry.project['project-1']).toMatchObject({ identity: { name: 'Created' } });

    emitEntityUpdated({ type: 'project', entity: { _id: 'project-1', identity: { name: 'Updated' } } });
    expect(store.registry.project['project-1']).toMatchObject({ identity: { name: 'Updated' } });

    emitEntityDeleted({ type: 'project', id: 'project-1' });
    expect(store.registry.project['project-1']).toBeUndefined();
  });

  it('derives ancestry from structured lineage and preserves revision qualification', () => {
    const store = useEntityStore();

    expect(store.getAncestry('cassetteInstance', {
      lineage: {
        project: { entityType: 'project', entityId: 'project-1' },
        queue: { entityType: 'queue', entityId: 'queue-1', revisionId: 'revision-2' }
      },
      data: { projectSlug: 'legacy-project', queueId: 'legacy-queue' }
    })).toEqual([
      { type: 'project', id: 'project-1' },
      { type: 'queue', id: 'queue-1', revisionId: 'revision-2' }
    ]);
  });
});
