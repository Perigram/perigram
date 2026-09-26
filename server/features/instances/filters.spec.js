import { describe, expect, it } from 'vitest';
import { listQueryFilter } from './filters.js';

// The canonical filter tree addresses the primary state as `state`
// (filterFromFlatFilters maps primaryState/primaryStates onto it) and the
// §3 document stores it top-level beside `fields`. Ways the projection
// fails: the state address drops into the row-fields map (`fields.state` —
// a path no document carries, so every status window matches nothing), an
// undeclared bare key leaks into a query path, or lineage/id addresses
// lose their storage paths.
describe('instance list query projection', () => {
  it('projects the primary state window onto the top-level state slot', () => {
    expect(listQueryFilter({ primaryStates: 'draft,active' })).toEqual({
      state: { $in: ['draft', 'active'] }
    });
    expect(listQueryFilter({ primaryState: 'created' })).toEqual({ state: 'created' });
  });

  it('keeps id, lineage, and legacy axis addresses at their storage paths', () => {
    expect(listQueryFilter({ _id: 'i-1' })).toEqual({ _id: 'i-1' });
    expect(listQueryFilter({ holderId: 'h-1' }, new Set(['holderId']))).toEqual({
      'lineage.holderId': 'h-1'
    });
    expect(listQueryFilter({ 'states.main': 'created' })).toEqual({ 'states.main': 'created' });
  });

  it('drops bare keys the type never declared as lineage vocabulary', () => {
    expect(listQueryFilter({ anything: 'x' }, new Set(['holderId']))).toEqual({});
  });
});
