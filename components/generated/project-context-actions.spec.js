import { describe, expect, it } from 'vitest';
import { projectContextActionEntries } from './project-context-actions.js';

const project = {
  _id: 'project-1',
  status: { state: { primary: 'ACTIVE' } }
};

describe('project context actions', () => {
  it('keeps project relation actions in the strip when child regions reference them', () => {
    const entries = projectContextActionEntries({
      project,
      screenActionIds: ['link_library'],
      childSections: [{
        entityType: 'library',
        region: { id: 'libraries', actions: ['link_library'] }
      }],
      actionManifest: [{
        actionId: 'link_library',
        label: 'Link library',
        actionKind: 'updateEntity',
        entityType: 'project'
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
        entityType: 'library',
        context: { parentEntityId: 'project-1' },
        region: { id: 'libraries', actions: ['create_library'] }
      }],
      actionManifest: [{
        actionId: 'create_library',
        actionKind: 'createEntity',
        entityType: 'library',
        parentEntityType: 'project'
      }]
    });

    expect(entries).toMatchObject([{
      actionId: 'create_library',
      entity: null,
      context: { parentEntityId: 'project-1' }
    }]);
  });

  it('keeps unlink out of the owner strip', () => {
    const entries = projectContextActionEntries({
      project,
      screenActionIds: ['unlink_library'],
      actionManifest: [{
        actionId: 'unlink_library',
        actionKind: 'updateEntity',
        entityType: 'project',
        relationMutation: { operation: 'unlink', key: 'library', targetType: 'library' }
      }]
    });

    expect(entries).toEqual([]);
  });
});
