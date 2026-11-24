import { describe, expect, it } from 'vitest';
import { scopedLineageData } from './action-launch-context.js';

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
    fields: [
      {
        id: 'lineage.libraryId',
        path: 'lineage.libraryId',
        type: 'entity',
        typeId: 'library',
        prompt: true
      }
    ]
  },
  construction: { mode: 'editor', inputs: ['lineage.libraryId'] }
};

const type = bundle.types[1];

describe('scopedLineageData', () => {
  it('binds the launch parent on the create lineage row', () => {
    expect(scopedLineageData(action, {
      scopeTypeId: 'library',
      scopeId: 'library-1',
      type,
      bundle
    })).toEqual({ 'lineage.libraryId': 'library-1' });
  });

  it('leaves a contextless launch empty', () => {
    expect(scopedLineageData(action, { type, bundle })).toEqual({});
  });

  it('ignores a scope whose type the create does not accept', () => {
    expect(scopedLineageData(action, {
      scopeTypeId: 'organization',
      scopeId: 'org-1',
      type,
      bundle
    })).toEqual({});
  });
});
