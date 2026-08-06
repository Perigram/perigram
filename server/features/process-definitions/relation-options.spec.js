import { describe, expect, it } from 'vitest';
import { resolveRelationOptionScope } from './relation-options.js';

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
