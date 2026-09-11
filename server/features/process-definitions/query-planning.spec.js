import { describe, expect, it, vi } from 'vitest';
import { executeProcessQuery, processQueryFilters } from './service.js';

describe('process query planning', () => {
  it('pushes a source equality while leaving residual predicates unfiltered', () => {
    expect(processQueryFilters({ kind: 'field', operation: 'eq', path: 'identity.name', value: 'Alpha' }))
      .toEqual({ 'identity.name': 'Alpha' });
    expect(processQueryFilters({ kind: 'field', operation: 'gt', path: 'specs.width', value: 10 })).toEqual({});
    expect(processQueryFilters({ kind: 'logic', operation: 'and' })).toEqual({});
  });

  it('preserves residual evaluation and forwards auth to the authoritative list adapter', async () => {
    const auth = { userId: 'user-1', organizationId: 'org-1' };
    const list = vi.fn().mockResolvedValue([
      { identity: { name: 'Alpha' } },
      { identity: { name: 'Beta' } }
    ]);
    const predicate = { kind: 'field', operation: 'eq', path: 'identity.name', value: 'Alpha' };

    await expect(executeProcessQuery(list, predicate, auth)).resolves.toEqual([{ identity: { name: 'Alpha' } }]);
    expect(list).toHaveBeenCalledWith({ 'identity.name': 'Alpha' }, auth);

    const residual = { kind: 'field', operation: 'gt', path: 'specs.width', value: 10 };
    list.mockResolvedValue([{ specs: { width: 8 } }, { specs: { width: 12 } }]);
    await expect(executeProcessQuery(list, residual, auth)).resolves.toEqual([{ specs: { width: 12 } }]);
    expect(list).toHaveBeenLastCalledWith({}, auth);
  });
});
