import { describe, expect, it } from 'vitest';
import {
  entitySelectLabel,
  entitySelectValue,
  labelValueSelectOptions,
  namedSelectOptions,
  selectOptionText
} from './selectOptions.js';

describe('select option helpers', () => {
  it('returns a string label from canonical DTO identity data', () => {
    expect(entitySelectLabel({ identity: { name: 'Warehouse A' }, _id: 'wh-1' })).toBe('Warehouse A');
    expect(entitySelectLabel({ identity: { slug: 'warehouse-a' }, _id: 'wh-1' })).toBe('warehouse-a');
  });

  it('falls back to id-like values instead of undefined labels', () => {
    expect(entitySelectLabel({ _id: 'tool-1' })).toBe('tool-1');
    expect(entitySelectValue({ _id: 'tool-1' })).toBe('tool-1');
  });

  it('normalizes arrays for PrimeVue optionLabel="name" selectors', () => {
    expect(namedSelectOptions([{ identity: { name: 'Tool' }, _id: 'tool-1' }])).toEqual([
      { identity: { name: 'Tool' }, _id: 'tool-1', name: 'Tool' }
    ]);
  });

  it('never returns undefined from text selection', () => {
    expect(selectOptionText(undefined, null, '')).toBe('');
  });

  it('normalizes arrays for PrimeVue option-label label selectors', () => {
    expect(labelValueSelectOptions([
      { identity: { name: 'Template A' }, _id: 'profile-1' },
      { name: '', _id: 'profile-2' },
      null,
      { identity: {} }
    ], 'Profile')).toEqual([
      { label: 'Template A', value: 'profile-1' },
      { label: 'profile-2', value: 'profile-2' }
    ]);
  });
});
