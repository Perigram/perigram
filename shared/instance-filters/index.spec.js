import { describe, it, expect } from 'vitest';
import {
  FILTER_OPS,
  normalizeFilter,
  filterFromFlatFilters,
  instanceMatchesFilter
} from './index.js';

// The pinned legacy semantics every consumer relied on before the tree
// existed: empty values skip, transport parameters are not filters, and an
// unknown key is noise — never a query path.
describe('flat transport projection', () => {
  it('expands the transport vocabulary into tree predicates', () => {
    const tree = filterFromFlatFilters({
      _id: '507f1f77bcf86cd799439011',
      primaryState: 'available',
      binId: 'bin-1',
      'lineage.shelfId': 'shelf-2'
    }, { lineageKeys: new Set(['binId', 'shelfId']) });
    expect(tree).toEqual({
      and: [
        { field: '_id', op: 'eq', value: '507f1f77bcf86cd799439011' },
        { field: 'states.main', op: 'eq', value: 'available' },
        { field: 'lineage.binId', op: 'eq', value: 'bin-1' },
        { field: 'lineage.shelfId', op: 'eq', value: 'shelf-2' }
      ]
    });
  });

  it('splits primaryStates CSV into one in-predicate', () => {
    expect(filterFromFlatFilters({ primaryStates: 'available, installed,' }))
      .toEqual({ field: 'states.main', op: 'in', value: ['available', 'installed'] });
    expect(filterFromFlatFilters({ primaryStates: ' , ' })).toBeNull();
  });

  it('drops transport parameters, empty values, and first-wins arrays', () => {
    expect(filterFromFlatFilters({ limit: 50, skip: 10 })).toBeNull();
    expect(filterFromFlatFilters({ primaryState: '', binId: null, other: undefined }, { lineageKeys: new Set(['binId']) }))
      .toBeNull();
    expect(filterFromFlatFilters({ binId: ['bin-2', 'bin-3'] }, { lineageKeys: new Set(['binId']) }))
      .toEqual({ field: 'lineage.binId', op: 'eq', value: 'bin-2' });
  });

  it('gates bare and dotted lineage keys on the declared vocabulary when supplied', () => {
    expect(filterFromFlatFilters({ binId: 'bin-1', mysteryId: 'nope' }, { lineageKeys: new Set(['binId']) }))
      .toEqual({ field: 'lineage.binId', op: 'eq', value: 'bin-1' });
    expect(filterFromFlatFilters({ 'lineage.mysteryId': 'nope' }, { lineageKeys: new Set(['binId']) }))
      .toBeNull();
  });

  it('treats every bare key as a lineage key without a declared set (client default)', () => {
    expect(filterFromFlatFilters({ madeById: 'w-1' }))
      .toEqual({ field: 'lineage.madeById', op: 'eq', value: 'w-1' });
  });
});

describe('normalizeFilter', () => {
  it('collapses empty and single-child combinators', () => {
    expect(normalizeFilter({ and: [] })).toBeNull();
    expect(normalizeFilter({ or: [{ field: 'grade', op: 'eq', value: 'a' }] }))
      .toEqual({ field: 'grade', op: 'eq', value: 'a' });
    expect(normalizeFilter({ and: [null, { field: 'grade', op: 'eq', value: 'a' }] }))
      .toEqual({ field: 'grade', op: 'eq', value: 'a' });
    expect(normalizeFilter({ not: { field: 'grade', op: 'eq', value: '' } })).toBeNull();
  });

  it('drops malformed nodes as no-ops instead of failing the surface', () => {
    expect(normalizeFilter({ field: 'grade', op: 'regex', value: 'a' })).toBeNull();
    expect(normalizeFilter({ field: 'grade', op: 'eq' })).toBeNull();
    expect(normalizeFilter({ op: 'eq', value: 'a' })).toBeNull();
    expect(normalizeFilter({ field: 'grade', op: 'in', value: 'a' })).toBeNull();
    expect(normalizeFilter({ field: 'grade', op: 'in', value: [] })).toBeNull();
    expect(normalizeFilter('nonsense')).toBeNull();
    expect(normalizeFilter({ and: ['nonsense', { field: 'grade', op: 'eq', value: 'a' }] }))
      .toEqual({ field: 'grade', op: 'eq', value: 'a' });
  });

  it('freezes the normalized tree', () => {
    const tree = normalizeFilter({ and: [{ field: 'grade', op: 'eq', value: 'a' }] });
    expect(Object.isFrozen(tree)).toBe(true);
  });

  it('keeps the operator set closed', () => {
    expect(FILTER_OPS).toEqual(['eq', 'in', 'contains']);
  });
});

describe('instanceMatchesFilter', () => {
  const instance = {
    id: 'w-9',
    fields: { name: 'Mystery Part', size: { value: 12, unit: 'mm' }, grade: 'a' },
    lineage: { madeById: { type: 'user', id: 'u-1' }, zoneId: 'z-2' },
    states: { main: 'available' }
  };

  it('matches equality over fields, quantities by value, and coerces scalars', () => {
    expect(instanceMatchesFilter(instance, { field: 'grade', op: 'eq', value: 'a' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'size', op: 'eq', value: 12 })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'size', op: 'eq', value: '12' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'grade', op: 'eq', value: 'b' })).toBe(false);
    expect(instanceMatchesFilter(instance, { field: 'absent', op: 'eq', value: 'x' })).toBe(false);
  });

  it('matches the primary status, lineage ref ids, and the instance id', () => {
    expect(instanceMatchesFilter(instance, { field: 'states.main', op: 'eq', value: 'available' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'lineage.madeById', op: 'eq', value: 'u-1' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'lineage.zoneId', op: 'eq', value: 'z-2' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'lineage.madeById', op: 'eq', value: 'u-2' })).toBe(false);
    expect(instanceMatchesFilter(instance, { field: '_id', op: 'eq', value: 'w-9' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'id', op: 'eq', value: 'w-9' })).toBe(true);
  });

  it('matches membership and case-insensitive substrings', () => {
    expect(instanceMatchesFilter(instance, { field: 'states.main', op: 'in', value: ['installed', 'available'] })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'states.main', op: 'in', value: ['installed'] })).toBe(false);
    expect(instanceMatchesFilter(instance, { field: 'name', op: 'contains', value: 'MYSTERY' })).toBe(true);
    expect(instanceMatchesFilter(instance, { field: 'name', op: 'contains', value: 'zzz' })).toBe(false);
    expect(instanceMatchesFilter(instance, { field: 'id', op: 'contains', value: 'w-9' })).toBe(true);
  });

  it('evaluates composed and nested trees; a null filter matches everything', () => {
    expect(instanceMatchesFilter(instance, null)).toBe(true);
    expect(instanceMatchesFilter(instance, normalizeFilter(null))).toBe(true);
    const tree = {
      and: [
        { or: [{ field: 'grade', op: 'eq', value: 'b' }, { field: 'grade', op: 'eq', value: 'a' }] },
        { not: { field: 'states.main', op: 'eq', value: 'installed' } }
      ]
    };
    expect(instanceMatchesFilter(instance, tree)).toBe(true);
    const refused = {
      and: [
        { or: [{ field: 'grade', op: 'eq', value: 'b' }, { field: 'name', op: 'contains', value: 'zzz' }] },
        { not: { field: 'states.main', op: 'eq', value: 'available' } }
      ]
    };
    expect(instanceMatchesFilter(instance, refused)).toBe(false);
  });

  it('never throws on empty or malformed instances', () => {
    expect(instanceMatchesFilter({}, { field: 'grade', op: 'eq', value: 'a' })).toBe(false);
    expect(instanceMatchesFilter(null, null)).toBe(true);
    expect(instanceMatchesFilter(undefined, { field: 'name', op: 'contains', value: 'x' })).toBe(false);
  });
});
