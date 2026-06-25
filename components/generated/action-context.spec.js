import { describe, expect, it } from 'vitest';
import {
  generatedActionRequiresParent,
  mergeCollectionActionContext,
  resolveGeneratedActionEntities
} from './action-context.js';

describe('generated action context', () => {
  it('preserves opened parent context for child collection actions', () => {
    const library = { _id: 'library-1', identity: { name: 'Library 1' } };
    const context = mergeCollectionActionContext({
      incoming: { parentEntityType: 'library', parentEntity: library },
      entityType: 'cassette',
      items: [{ _id: 'cassette-1', identity: { name: 'Cassette 1' } }]
    });

    expect(context.parentEntityType).toBe('library');
    expect(context.parentEntity).toBe(library);
    expect(context.entityType).toBe('cassette');
    expect(context.parentOptions).toEqual([]);
  });

  it('uses opened parent entity as the create action parent id', () => {
    const entities = resolveGeneratedActionEntities({
      action: { actionKind: 'createEntity', entityType: 'cassette', parentEntityType: 'library' },
      context: {
        parentEntityType: 'library',
        parentEntity: { _id: 'library-1' },
        entityType: 'cassette'
      },
      screen: { entityType: 'library', scope: { entityId: 'library-1' } }
    });

    expect(entities).toEqual({ library: 'library-1' });
  });

  it('does not use a detail entity id as an unrelated parent id', () => {
    expect(generatedActionRequiresParent({
      action: { actionKind: 'createEntity', entityType: 'cassette', parentEntityType: 'library' },
      screen: { entityType: 'project', scope: { entityId: 'project-1' } }
    })).toBe('library');
  });
});
