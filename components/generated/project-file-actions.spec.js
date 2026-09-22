import { describe, expect, it } from 'vitest';
import { projectContextActionEntries } from './project-context-actions.js';

const project = {
  _id: 'project-1',
  states: { main: 'READY' }
};

describe('project context action palette', () => {
  it('uses compiled project and child-create actions with their project contexts', () => {
    const projectContext = { parentTypeId: 'project', parentEntity: project, parentEntityId: 'project-1' };
    const childContext = { ...projectContext, typeId: 'queue' };
    const entries = projectContextActionEntries({
      actionManifest: [
        { id: 'rename-project', actionKind: 'updateInstance', typeId: 'project' },
        { id: 'create-queue', actionKind: 'createInstance', typeId: 'queue', parentTypeId: 'project' },
        { id: 'unavailable', actionKind: 'createInstance', typeId: 'cassette', parentTypeId: 'warehouse' }
      ],
      screenActionIds: ['rename-project'],
      childSections: [{
        typeId: 'queue',
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
          id: 'ready-create',
          actionKind: 'createInstance',
          typeId: 'queue',
          parentTypeId: 'project',
          state: { from: 'READY' }
        },
        {
          id: 'draft-create',
          actionKind: 'createInstance',
          typeId: 'queue',
          parentTypeId: 'project',
          state: { from: 'DRAFT' }
        }
      ],
      childSections: [{
        typeId: 'queue',
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
        { id: 'screen-action', actionKind: 'runCommand', typeId: 'project' },
        { id: 'global-action', actionKind: 'runCommand', typeId: 'project' }
      ],
      screenActionIds: ['screen-action'],
      project
    });

    expect(entries.map(entry => entry.actionId)).toEqual(['screen-action']);
  });
});
