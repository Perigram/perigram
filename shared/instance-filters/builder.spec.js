import { describe, it, expect } from 'vitest';
import { filterFromBuilderRows, builderRowsFromFilter } from './builder.js';
import { instanceMatchesFilter } from './index.js';

// The builder edit model (rows + one combinator + per-row negation) is the
// user-facing projection of the canonical filter tree. Failure modes first:
// invalid rows drop, negation wraps `not`, collapse rules match
// normalizeFilter, and foreign trees decompose losslessly or not at all.
describe('filterFromBuilderRows', () => {
  it('composes one group with the row combinator and collapses empty/single', () => {
    expect(filterFromBuilderRows([], 'and')).toBeNull();
    const single = filterFromBuilderRows([{ field: 'name', op: 'contains', value: 'girder', negate: false }], 'or');
    expect(single).toEqual({ field: 'name', op: 'contains', value: 'girder' });
    const pair = filterFromBuilderRows([
      { field: 'name', op: 'contains', value: 'a', negate: false },
      { field: 'states.main', op: 'in', value: ['draft', 'done'], negate: false }
    ], 'and');
    expect(pair).toEqual({
      and: [
        { field: 'name', op: 'contains', value: 'a' },
        { field: 'states.main', op: 'in', value: ['draft', 'done'] }
      ]
    });
  });

  it('wraps negated rows in not and keeps the outer combinator', () => {
    const tree = filterFromBuilderRows([
      { field: 'name', op: 'contains', value: 'a', negate: true },
      { field: 'states.main', op: 'eq', value: 'draft', negate: false }
    ], 'or');
    expect(tree).toEqual({
      or: [
        { not: { field: 'name', op: 'contains', value: 'a' } },
        { field: 'states.main', op: 'eq', value: 'draft' }
      ]
    });
    expect(instanceMatchesFilter({ fields: { name: 'bolt' }, states: { main: 'draft' } }, tree)).toBe(true);
    expect(instanceMatchesFilter({ fields: { name: 'a-frame' }, states: { main: 'draft' } }, tree)).toBe(true);
    expect(instanceMatchesFilter({ fields: { name: 'a-frame' }, states: { main: 'done' } }, tree)).toBe(false);
  });

  it('drops incomplete and malformed rows as no-ops', () => {
    expect(filterFromBuilderRows([
      { field: 'name', op: 'contains', value: '', negate: false },
      { field: 'states.main', op: 'in', value: [], negate: false },
      { field: '', op: 'eq', value: 'x', negate: false },
      { field: 'grade', op: 'regex', value: 'x', negate: false },
      null,
      'junk'
    ], 'and')).toBeNull();
  });
});

describe('builderRowsFromFilter', () => {
  it('round-trips trees the builder emits', () => {
    const rows = [
      { field: 'name', op: 'contains', value: 'a', negate: true },
      { field: 'states.main', op: 'in', value: ['draft', 'done'], negate: false },
      { field: 'grade', op: 'eq', value: 'b', negate: true }
    ];
    const tree = filterFromBuilderRows(rows, 'and');
    expect(builderRowsFromFilter(tree)).toEqual({ combinator: 'and', rows });
    const single = filterFromBuilderRows([rows[1]], 'or');
    // A single-row group collapses to the bare predicate; its combinator is
    // unobservable, so decomposition reports the default.
    expect(builderRowsFromFilter(single)).toEqual({ combinator: 'and', rows: [rows[1]] });
  });

  it('refuses foreign shapes instead of corrupting them', () => {
    expect(builderRowsFromFilter(null)).toBeNull();
    // A collapsed single predicate is one row with the default combinator.
    expect(builderRowsFromFilter({ field: 'name', op: 'contains', value: 'a', negate: false }))
      .toEqual({ combinator: 'and', rows: [{ field: 'name', op: 'contains', value: 'a', negate: false }] });
    expect(builderRowsFromFilter({ or: [{ and: [{ field: 'name', op: 'eq', value: 'a' }] }] })).toBeNull();
  });
});

