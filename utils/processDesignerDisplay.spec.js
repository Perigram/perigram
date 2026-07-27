import { describe, expect, it } from 'vitest';
import { normalizeProcessDisplayName } from './processDesignerDisplay.js';

describe('process designer display names', () => {
  it('collapses repeated draft suffixes without changing the base name', () => {
    expect(normalizeProcessDisplayName('Manufacturing draft draft draft')).toBe('Manufacturing');
  });

  it('does not alter names that contain draft as meaningful text', () => {
    expect(normalizeProcessDisplayName('Drafting workflow')).toBe('Drafting workflow');
  });

  it('handles empty names', () => {
    expect(normalizeProcessDisplayName()).toBe('');
  });
});
