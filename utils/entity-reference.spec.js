import { describe, expect, it } from 'vitest';
import { formatEntityReference, lineageReference, parseEntityReference } from './entity-reference.js';

describe('entity references', () => {
  it('round trips optional revision-qualified references', () => {
    const ref = { entityType: 'project', entityId: 'project-1', revisionId: 'revision-4' };
    expect(parseEntityReference(formatEntityReference(ref))).toEqual(ref);
    expect(parseEntityReference('project/project-1')).toEqual({ entityType: 'project', entityId: 'project-1' });
  });

  it('reads a structured revision-qualified lineage reference', () => {
    expect(lineageReference({ project: { entityType: 'project', entityId: 'project-1', revisionId: 'revision-4' } }, 'project')).toEqual({
      entityType: 'project',
      entityId: 'project-1',
      revisionId: 'revision-4'
    });
  });
});
