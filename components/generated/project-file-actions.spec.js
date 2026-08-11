import { describe, expect, it } from 'vitest';
import { projectContextActionEntries } from './project-context-actions.js';

const project = {
  _id: 'project-1',
  status: { state: { primary: 'READY' } }
};

describe('project context action palette', () => {
  it('uses compiled project and child-create actions with their project contexts', () => {
    const projectContext = { parentEntityType: 'project', parentEntity: project, parentEntityId: 'project-1' };
    const childContext = { ...projectContext, entityType: 'queue' };
    const entries = projectContextActionEntries({
      actionManifest: [
        { actionId: 'rename-project', actionKind: 'updateEntity', entityType: 'project' },
        { actionId: 'create-queue', actionKind: 'createEntity', entityType: 'queue', parentEntityType: 'project' },
        { actionId: 'unavailable', actionKind: 'createEntity', entityType: 'cassette', parentEntityType: 'warehouse' }
      ],
      screenActionIds: ['rename-project'],
      childSections: [{
        entityType: 'queue',
        region: { id: 'queues', actions: ['create-queue'] },
        context: childContext
      }],
      project,
      projectContext
    });

    expect(entries.map(entry => entry.actionId)).toEqual(['rename-project', 'create-queue']);
    expect(entries[0]).toMatchObject({ entity: project, context: projectContext });
    expect(entries[1]).toMatchObject({ entity: null, context: childContext });
  });

  it('omits actions that are unavailable for the current project lifecycle state', () => {
    const entries = projectContextActionEntries({
      actionManifest: [
        {
          actionId: 'ready-create',
          actionKind: 'createEntity',
          entityType: 'queue',
          parentEntityType: 'project',
          status: { from: 'READY' }
        },
        {
          actionId: 'draft-create',
          actionKind: 'createEntity',
          entityType: 'queue',
          parentEntityType: 'project',
          status: { from: 'DRAFT' }
        }
      ],
      childSections: [{
        entityType: 'queue',
        region: { id: 'queues', actions: ['ready-create', 'draft-create'] },
        context: {}
      }],
      project
    });

    expect(entries.map(entry => entry.actionId)).toEqual(['ready-create']);
  });

  it('does not surface manifest actions that are absent from the compiled project screen', () => {
    const entries = projectContextActionEntries({
      actionManifest: [
        { actionId: 'screen-action', actionKind: 'runCommand', entityType: 'project' },
        { actionId: 'global-action', actionKind: 'runCommand', entityType: 'project' }
      ],
      screenActionIds: ['screen-action'],
      project
    });

    expect(entries.map(entry => entry.actionId)).toEqual(['screen-action']);
  });
});
