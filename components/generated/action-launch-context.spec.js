import { describe, expect, it } from 'vitest';
import { scopedLineagePayload } from './action-launch-context.js';

const bundle = {
  types: [
    {
      id: 'library',
      edges: {
        children: {
          cassettes: { lineageKey: 'libraryId', types: ['cassette-template'] }
        }
      }
    },
    { id: 'cassette-template', fields: { name: { base: 'string', identifier: true } } }
  ]
};

const action = {
  actionKind: 'createEntity',
  typeId: 'cassette-template',
  inputPolicy: {
    fields: [{
      id: 'lineage.libraryId',
      path: 'lineage.libraryId',
      type: 'entity',
      typeId: 'library',
      prompt: true
    }]
  },
  construction: { mode: 'editor', inputs: ['lineage.libraryId'] }
};

const type = bundle.types[1];

describe('scopedLineagePayload', () => {
  it('binds the launch parent on the create lineage row', () => {
    expect(scopedLineagePayload(action, {
      scopeTypeId: 'library',
      scopeId: 'library-1',
      type,
      bundle
    })).toEqual({ 'lineage.libraryId': 'library-1' });
  });

  it('leaves a contextless launch empty', () => {
    expect(scopedLineagePayload(action, { type, bundle })).toEqual({});
  });

  it('ignores a scope whose type the create does not accept', () => {
    expect(scopedLineagePayload(action, {
      scopeTypeId: 'organization',
      scopeId: 'org-1',
      type,
      bundle
    })).toEqual({});
  });
});
