import { describe, expect, it } from 'vitest';
import { resolveInstanceRelationRefs } from './instance-relations.js';

// SPEC §6 relation grammar: a declared ref field stores under
// `relations.<name>`; a stored shape without its own type adopts the
// declared target (the caller's fallback).
describe('resolveInstanceRelationRefs', () => {
  it('resolves a bare stored id against the declared target type', () => {
    expect(resolveInstanceRelationRefs('6ada6902', { typeId: 'cassette-design' }))
      .toEqual([{ typeId: 'cassette-design', id: '6ada6902' }]);
  });

  it('resolves ref objects, revision pins, and arrays of either shape', () => {
    expect(resolveInstanceRelationRefs({ type: 'cassette-design', id: 'a' }, {}))
      .toEqual([{ typeId: 'cassette_design', id: 'a', entity: null }]);
    expect(resolveInstanceRelationRefs(
      [{ type: 'cassette-design', id: 'a' }, 'b'],
      { typeId: 'cassette-design' }
    )).toEqual([
      { typeId: 'cassette_design', id: 'a', entity: null },
      { typeId: 'cassette-design', id: 'b' }
    ]);
    expect(resolveInstanceRelationRefs({ type: 'cassette-design', id: 'a', revisionId: 'r1' }, {}))
      .toEqual([{ typeId: 'entity_revision', id: 'r1', source: { typeId: 'cassette_design', id: 'a' }, entity: null }]);
  });

  it('drops typeless bare ids and empty values', () => {
    expect(resolveInstanceRelationRefs('orphan', {})).toEqual([]);
    expect(resolveInstanceRelationRefs(null, { typeId: 'cassette-design' })).toEqual([]);
    expect(resolveInstanceRelationRefs('', { typeId: 'cassette-design' })).toEqual([]);
  });
});
