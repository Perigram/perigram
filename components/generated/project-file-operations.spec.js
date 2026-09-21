import { describe, expect, it } from 'vitest';
import { projectContextActionEntries } from './project-context-actions.js';
import { generatedActionRendersAt, generatedActionSurface } from './action-placement.js';
import { resolveGeneratedEntityActions } from './action-visibility.js';

describe('project file operations', () => {
  const project = { _id: 'project-1', identity: { uid: 'project-1' }, status: { state: { primary: 'ACTIVE' } } };
  const actions = [
    { id: 'create-artifact', actionKind: 'createInstance', typeId: 'artifact', parentTypeId: 'project', access: { roleIds: ['operator'] } },
    { id: 'rename-project', actionKind: 'updateInstance', typeId: 'project', access: { roleIds: ['operator'] } }
  ];

  it('places parent-bound creation in collection/project context and entity mutation in detail context', () => {
    expect(generatedActionSurface(actions[0])).toBe('collection');
    expect(generatedActionRendersAt(actions[0], ['collection'])).toBe(true);
    expect(generatedActionSurface(actions[1])).toBe('entity');
    expect(generatedActionRendersAt(actions[1], ['entity'])).toBe(true);
  });

  it('derives the project action palette from compiled actions and the selected project DTO', () => {
    const entries = projectContextActionEntries({
      project,
      actionManifest: actions,
      projectContext: { parentTypeId: 'project' },
      childSections: [{ typeId: 'artifact', region: { id: 'artifacts', actions: ['create-artifact'] }, context: { projectId: 'project-1' } }]
    });
    expect(entries.map(entry => entry.actionId)).toContain('create-artifact');
  });

  it('filters generated entity actions by the current entity contract', () => {
    expect(resolveGeneratedEntityActions({
      actionIds: actions.map(action => action.id),
      actionManifest: actions,
      entity: project,
      typeId: 'project'
    }).map(action => action.id)).toContain('rename-project');
  });
});
