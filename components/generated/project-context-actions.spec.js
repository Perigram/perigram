import { describe, expect, it } from 'vitest';
import { projectContextActionEntries } from './project-context-actions.js';

const project = {
  _id: 'project-1',
  states: { main: 'ACTIVE' }
};

describe('project context actions', () => {
  it('keeps project relation actions in the strip when child regions reference them', () => {
    const entries = projectContextActionEntries({
      project,
      screenActionIds: ['link_library'],
      childSections: [{
        typeId: 'library',
        region: { id: 'libraries', actions: ['link_library'] }
      }],
      actionManifest: [{
        id: 'link_library',
        label: 'Link library',
        actionKind: 'updateInstance',
        typeId: 'project'
      }]
    });

    expect(entries).toMatchObject([{
      actionId: 'link_library',
      entity: project
    }]);
  });

  it('moves project-bound child creates to their collection context once', () => {
    const entries = projectContextActionEntries({
      project,
      screenActionIds: ['create_library'],
      childSections: [{
        typeId: 'library',
        context: { parentEntityId: 'project-1' },
        region: { id: 'libraries', actions: ['create_library'] }
      }],
      actionManifest: [{
        id: 'create_library',
        actionKind: 'createInstance',
        typeId: 'library',
        parentTypeId: 'project'
      }]
    });

    expect(entries).toMatchObject([{
      actionId: 'create_library',
      entity: null,
      context: { parentEntityId: 'project-1' }
    }]);
  });

  it('renders one button for duplicate compiled ids of the same visible create operation', () => {
    const entries = projectContextActionEntries({
      project,
      screenActionIds: ['create_cassette_a', 'create_cassette_b'],
      actionManifest: [
        {
          id: 'create_cassette_a',
          actionKind: 'createInstance',
          typeId: 'cassette',
          parentTypeId: 'project'
        },
        {
          id: 'create_cassette_b',
          actionKind: 'createInstance',
          typeId: 'cassette',
          parentTypeId: 'project'
        }
      ]
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].actionId).toBe('create_cassette_b');
  });

  it('keeps unlink out of the owner strip', () => {
    const entries = projectContextActionEntries({
      project,
      screenActionIds: ['unlink_library'],
      actionManifest: [{
        id: 'unlink_library',
        actionKind: 'unlink',
        typeId: 'project',
        relation: { key: 'library', targetType: 'library' }
      }]
    });

    expect(entries).toEqual([]);
  });
});
