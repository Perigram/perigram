import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { toFlexibleId, decodeRouteId } from './objectid.js';

describe('toFlexibleId', () => {
  it('converts 24-char hex strings to ObjectId', () => {
    const hex = '507f1f77bcf86cd799439011';
    expect(toFlexibleId(hex)).toEqual(new ObjectId(hex));
  });

  it('passes plain flexible string ids through', () => {
    expect(toFlexibleId('unnamed-project-MhHo8q')).toBe('unnamed-project-MhHo8q');
  });

  it('decodes percent-encoded route params before matching', () => {
    expect(toFlexibleId('yon020g7%20%28Base%20Design%29')).toBe('yon020g7 (Base Design)');
    expect(toFlexibleId('%D0%9E%D1%87%D0%B5%D1%80%D0%B5%D0%B4%D0%B8')).toBe('Очереди');
  });

  it('keeps malformed percent sequences intact', () => {
    expect(toFlexibleId('literal%zz-value')).toBe('literal%zz-value');
  });

  it('passes ObjectId instances and falsy values through', () => {
    const id = new ObjectId();
    expect(toFlexibleId(id)).toBe(id);
    expect(toFlexibleId('')).toBe('');
    expect(toFlexibleId(null)).toBe(null);
  });
});

describe('decodeRouteId', () => {
  it('returns non-encoded strings unchanged', () => {
    expect(decodeRouteId('plain-id')).toBe('plain-id');
  });
});
