import { describe, expect, it } from 'vitest';
import {
  formatProcessType,
  normalizeProcessSocket,
  processType,
  processTypesCompatible
} from './types.js';

describe('process v3 type algebra', () => {
  it('keeps base type, shape, nullability, and domain identity orthogonal', () => {
    const type = processType('entity', { entityType: 'queue', shape: 'tree', nullable: true });
    expect(type).toEqual({
      base: 'entity',
      shape: 'tree',
      nullable: true,
      entityType: 'queue'
    });
    expect(formatProcessType(type)).toBe('entity<queue>?{}');
  });

  it('broadcasts items but never narrows collections implicitly', () => {
    expect(processTypesCompatible(
      processType('number'),
      processType('number', { shape: 'tree' })
    )).toMatchObject({ ok: true, implicit: true, broadcast: true });
    expect(processTypesCompatible(
      processType('number', { shape: 'list' }),
      processType('number')
    )).toMatchObject({ ok: false, convertible: false });
  });

  it('requires visible conversions for safe type changes', () => {
    expect(processTypesCompatible(
      processType('integer'),
      processType('number')
    )).toMatchObject({
      ok: false,
      convertible: true,
      conversion: { nodeKind: 'value.cast' }
    });
    expect(processTypesCompatible(
      processType('entity', { entityType: 'queue' }),
      processType('entityRef', { entityType: 'queue' })
    )).toMatchObject({
      ok: false,
      convertible: true,
      conversion: { nodeKind: 'value.toEntityRef' }
    });
  });

  it('rejects nullable values and unlike entity types without a visible operation', () => {
    expect(processTypesCompatible(
      processType('string', { nullable: true }),
      processType('string')
    )).toMatchObject({ convertible: true, conversion: { nodeKind: 'value.required' } });
    expect(processTypesCompatible(
      processType('entity', { entityType: 'project' }),
      processType('entity', { entityType: 'queue' })
    ).ok).toBe(false);
  });

  it('normalizes socket role separately from transported type', () => {
    expect(normalizeProcessSocket({
      id: 'failure',
      role: 'failure',
      type: processType('error')
    })).toMatchObject({
      id: 'failure',
      role: 'failure',
      type: { base: 'error', shape: 'item' }
    });
  });
});
