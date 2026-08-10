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
  const lineageBindings = [
    { ancestorEntityType: 'project', childEntityType: 'queue', lineageKey: 'projectId' },
    { ancestorEntityType: 'library', childEntityType: 'cassette', lineageKey: 'libraryId' }
  ];
  const actions = {
    linkLibrary: {
      entityType: 'project',
      relationMutation: { operation: 'link', key: 'library', targetType: 'library' }
    }
  };

  it('derives the scoped source path from compiled lineage and a process relation', () => {
    expect(resolveRelationOptionPath({
      ownerType: 'queue',
      sourceType: 'cassette',
      lineageBindings,
      actions
    })).toEqual({
      ownerParent: { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
      sourceParent: { parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' },
      bridgeRelationKey: 'library'
    });
  });

  it('rejects an absent or ambiguous process bridge instead of leaking global options', () => {
    expect(resolveRelationOptionPath({
      ownerType: 'queue',
      sourceType: 'cassette',
      lineageBindings,
      actions: {}
    })).toBeNull();
    expect(resolveRelationOptionPath({
      ownerType: 'queue',
      sourceType: 'cassette',
      lineageBindings,
      actions: { ...actions, another: actions.linkLibrary }
    })).toBeNull();
  });
});
