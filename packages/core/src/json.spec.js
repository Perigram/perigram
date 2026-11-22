import { describe, expect, it } from 'vitest';
import { isJsonValue, isRecord } from './json.js';

describe('canonical JSON values', () => {
  it('accepts ordinary and null-prototype records', () => {
    expect(isRecord({ value: 1 })).toBe(true);
    expect(isRecord(Object.assign(Object.create(null), { value: 1 }))).toBe(true);
    expect(isJsonValue({ nested: [1, 'two', null, true] })).toBe(true);
  });

  it.each([
    ['Date', () => new Date()],
    ['Map', () => new Map()],
    ['Set', () => new Set()],
    ['typed array', () => new Uint8Array([1, 2])],
    ['class instance', () => new (class Example { constructor() { this.value = 1; } })()]
  ])('rejects %s instances', (_label, createValue) => {
    expect(isRecord(createValue())).toBe(false);
    expect(isJsonValue(createValue())).toBe(false);
  });

  it('rejects cyclic records and non-finite numbers', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(Infinity)).toBe(false);
  });
});
