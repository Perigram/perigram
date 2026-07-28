import { describe, expect, it } from 'vitest';
import { isProjectFileLauncherAction } from './project-file-actions.js';

describe('project file launcher actions', () => {
  it('includes direct project-child creation', () => {
    expect(isProjectFileLauncherAction({
      actionKind: 'createEntity',
      parentEntityType: 'project'
    })).toBe(true);
  });

  it('includes compiled relation and attachment mutations', () => {
    expect(isProjectFileLauncherAction({
      actionKind: 'updateEntity',
      inputs: [{ kind: 'entity', dataPath: 'relations.machine' }]
    })).toBe(true);
    expect(isProjectFileLauncherAction({
      actionKind: 'runCommand',
      inputs: [{ kind: 'attachment' }]
    })).toBe(true);
  });

  it('keeps normal entity and lifecycle actions in the header menu', () => {
    expect(isProjectFileLauncherAction({
      actionKind: 'updateEntity',
      inputs: [{ kind: 'status' }]
    })).toBe(false);
    expect(isProjectFileLauncherAction({
      actionKind: 'createEntity',
      parentEntityType: ''
    })).toBe(false);
  });
});
