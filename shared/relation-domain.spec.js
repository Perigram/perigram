import { describe, expect, it } from 'vitest';
import { filterByRelationDomain, relationDomainRow, withinRelationDomain } from './relation-domain.js';

// The declared relation target domain (CTS SPEC §6): one evaluator shared
// by the write boundary (R2) and every picker — pinned here so the row
// convention ({ value } is the target's stored row) cannot drift between
// its consumers.
const operatorsOnly = {
  op: 'in',
  args: [{ op: 'lit', value: 'role-operator' }, { op: 'field', path: ['value', 'roles'] }]
};

describe('relation target domain (SPEC §6)', () => {
  it('reads rows from the §3 wire shape and the legacy block shape', () => {
    expect(relationDomainRow({ fields: { roles: ['role-operator'] } })).toEqual({ roles: ['role-operator'] });
    expect(relationDomainRow({ data: { roles: ['role-operator'] }, specs: { width: 2 } }))
      .toEqual({ roles: ['role-operator'], width: 2 });
  });

  it('evaluates the domain expression over the target row', () => {
    expect(withinRelationDomain({ fields: { roles: ['role-operator', 'role-viewer'] } }, operatorsOnly)).toBe(true);
    expect(withinRelationDomain({ fields: { roles: ['role-viewer'] } }, operatorsOnly)).toBe(false);
    expect(withinRelationDomain({ fields: { roles: ['role-viewer'] } }, null)).toBe(true);
  });

  it('a failing or ill-typed evaluation refuses the candidate, never passes it', () => {
    expect(withinRelationDomain({ fields: { roles: 'role-operator' } }, operatorsOnly)).toBe(false);
    expect(withinRelationDomain({}, { op: 'field', path: ['value', 'ghost', 'deep'] })).toBe(false);
  });

  it('filters candidate pools for pickers through the same expression', () => {
    const candidates = [
      { _id: 'u-1', fields: { roles: ['role-operator'] } },
      { _id: 'u-2', fields: { roles: ['role-viewer'] } },
      { toJSON: () => ({ _id: 'u-3', fields: { roles: ['role-operator'] } }) }
    ];
    const idOf = item => (item?.toJSON ? item.toJSON() : item)._id;
    expect(filterByRelationDomain(candidates, operatorsOnly).map(idOf)).toEqual(['u-1', 'u-3']);
  });
});
