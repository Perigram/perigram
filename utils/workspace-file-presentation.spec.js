import { describe, expect, it } from 'vitest';
import { workspaceFilePresentation } from './workspace-file-presentation.js';

describe('workspace file presentation', () => {
  it('keeps UI-only state separate from the entity reference', () => {
    const entity = { _id: 'cassette-1', status: { state: { primary: 'ACTIVE' } } };
    const file = workspaceFilePresentation({ key: 'cassette:cassette-1', kind: 'entity', type: 'cassette', entity }, {
      icon: 'pi pi-box',
      modified: true
    });
    expect(file).toMatchObject({ entityType: 'cassette', icon: 'pi pi-box', modified: true });
    expect(file.lifecycleState).toEqual(entity.status.state);
    expect(entity).not.toHaveProperty('modified');
  });
});
