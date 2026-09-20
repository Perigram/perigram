// Class identity contract: name is the mutable label, id is the invisible
// stable identifier. Derived once from the first non-empty name, frozen
// after — renaming must never change the id (persisted instances, posted
// org types, producer outputs, and relations reference it).
import { describe, expect, it } from 'vitest';
import { derivedTypeId, isPlaceholderTypeId, slugifyTypeName } from './processDesignerIdentity.js';

describe('slugifyTypeName', () => {
  it('slugifies names into kebab registry ids', () => {
    expect(slugifyTypeName('Bio')).toBe('bio');
    expect(slugifyTypeName('Big Widget 2')).toBe('big-widget-2');
    expect(slugifyTypeName("Owner’s Choice")).toBe('owners-choice');
    expect(slugifyTypeName('2fast')).toBe('t-2fast');
    expect(slugifyTypeName('???')).toBe('');
  });
});

describe('derivedTypeId (derive once, freeze forever)', () => {
  it('seals the slug on the first name while the id is still the placeholder', () => {
    expect(derivedTypeId({ name: 'Bio', currentId: 'type-3' })).toBe('bio');
  });

  it('renaming after the seal NEVER changes the id', () => {
    expect(derivedTypeId({ name: 'Biology', currentId: 'bio' })).toBe('bio');
    expect(derivedTypeId({ name: 'Completely Different', currentId: 'bio' })).toBe('bio');
  });

  it('keeps the placeholder while the name is empty', () => {
    expect(derivedTypeId({ name: '', currentId: 'type-3' })).toBe('type-3');
  });

  it('deduplicates against the registry and sibling classes', () => {
    expect(derivedTypeId({ name: 'bio', currentId: 'type-3', taken: ['bio', 'widget'] })).toBe('bio-2');
  });

  it('recognizes placeholder ids only in the generated pattern', () => {
    expect(isPlaceholderTypeId('type-12')).toBe(true);
    expect(isPlaceholderTypeId('bio')).toBe(false);
    expect(isPlaceholderTypeId('typecaster')).toBe(false);
  });
});
