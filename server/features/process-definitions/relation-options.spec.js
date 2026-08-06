import { describe, expect, it } from 'vitest';
import { resolveRelationOptionPath, resolveRelationOptionScope } from './relation-options.js';

describe('relation option scope', () => {
  it('keeps embedded creators scoped when their source comes from construction inputs', () => {
    expect(resolveRelationOptionScope({
      actionId: 'create-design',
      inputPolicy: { fields: [] },
      construction: {
        inputs: [{ id: 'templateId', type: 'entity', entityType: 'cassette' }]
      }
    })).toEqual({
      scoped: true,
      sourceInput: { id: 'templateId', type: 'entity', entityType: 'cassette' }
    });
  });

  it('does not downgrade an unresolved embedded creator to global options', () => {
    expect(resolveRelationOptionScope({ actionId: 'create-design' }))
      .toEqual({ scoped: true, sourceInput: null });
    expect(resolveRelationOptionScope(null))
      .toEqual({ scoped: false, sourceInput: null });
  });
});

describe('relation option path', () => {
  const containment = [
    { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
    { parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }
  ];
  const actions = {
    linkLibrary: {
      entityType: 'project',
      relationMutation: { operation: 'link', key: 'library', targetType: 'library' }
    }
  };

  it('derives the scoped source path from domain containment and a process relation', () => {
    expect(resolveRelationOptionPath({
      ownerType: 'queue',
      sourceType: 'cassette',
      containment,
      actions
    })).toEqual({
      ownerParent: containment[0],
      sourceParent: containment[1],
      bridgeRelationKey: 'library'
    });
  });

  it('rejects an absent or ambiguous process bridge instead of leaking global options', () => {
    expect(resolveRelationOptionPath({
      ownerType: 'queue',
      sourceType: 'cassette',
      containment,
      actions: {}
    })).toBeNull();
    expect(resolveRelationOptionPath({
      ownerType: 'queue',
      sourceType: 'cassette',
      containment,
      actions: { ...actions, another: actions.linkLibrary }
    })).toBeNull();
  });
});
