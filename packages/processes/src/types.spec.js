import { describe, expect, it } from 'vitest';
import { formatProcessType, normalizeProcessSocket, processType, processTypesCompatible } from './types.js';

describe('process v4 type algebra', () => {
  it('keeps element type independent from tree access', () => {
    const type = processType('entity', { entityType: 'queue', nullable: true, shape: 'tree' });
    expect(type).toEqual({ base: 'entity', nullable: true, entityType: 'queue' });
    expect(formatProcessType(type)).toBe('entity<queue>?');
    expect(normalizeProcessSocket({ id: 'entities', type, access: 'list' })).toMatchObject({ access: 'list', type });
  });

  it('checks values without treating topology as compatibility', () => {
    expect(processTypesCompatible(processType('number'), processType('number'))).toMatchObject({ ok: true, implicit: true });
    expect(processTypesCompatible(processType('integer'), processType('number'))).toMatchObject({ ok: true, coercion: 'integerToNumber' });
    expect(processTypesCompatible(processType('entity', { entityType: 'project' }), processType('entity', { entityType: 'queue' })).ok).toBe(false);
  });

  it('keeps array values separate from data-tree branches', () => {
    const array = processType('array', { itemType: processType('entityRef', { entityType: 'queue' }) });
    expect(array).toMatchObject({ base: 'array', itemType: { base: 'entityRef' } });
    expect(processTypesCompatible(array, processType('array', { itemType: processType('entityRef', { entityType: 'project' }) })).ok).toBe(false);
  });
});
