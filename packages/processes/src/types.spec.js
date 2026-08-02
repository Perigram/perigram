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

  it('performs safe scalar and entity-reference coercions without plumbing nodes', () => {
    expect(processTypesCompatible(
      processType('integer'),
      processType('number')
    )).toMatchObject({
      ok: true,
      implicit: true,
      coercion: 'integerToNumber'
    });
    expect(processTypesCompatible(
      processType('entity', { entityType: 'queue' }),
      processType('entityRef', { entityType: 'queue' })
    )).toMatchObject({
      ok: true,
      implicit: true,
      coercion: 'entityToReference'
    });
  });

  it('rejects nullable values and unlike entity types that require author intent', () => {
    expect(processTypesCompatible(
      processType('string', { nullable: true }),
      processType('string')
    )).toMatchObject({ ok: false, convertible: false });
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

  it('keeps intrinsic arrays separate from packet lists', () => {
    const array = processType('array', {
      itemType: processType('entityRef', { entityType: 'queue' })
    });
    expect(array).toMatchObject({ base: 'array', shape: 'item', itemType: { base: 'entityRef' } });
    expect(processTypesCompatible(
      array,
      processType('array', { itemType: processType('entityRef', { entityType: 'project' }) })
    ).ok).toBe(false);
  });

  it('rejects qualifiers owned by another value family', () => {
    expect(() => processType('block', { block: 'identity', entityType: 'project' }))
      .toThrow('block cannot carry entityType');
    expect(() => processType('string', { block: 'identity' }))
      .toThrow('string cannot carry block');
  });
});
