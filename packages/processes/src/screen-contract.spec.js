import { describe, expect, it } from 'vitest';
import { normalizeScreenContract, validateScreenContract } from './screen-contract.js';

describe('screen contract normalization', () => {
  it('does not dereference nullable compiled screen entries', () => {
    expect(normalizeScreenContract(null)).toEqual({
      template: 'formAction',
      sources: [],
      regions: [],
      actions: []
    });
  });

  it('reports a malformed screen instead of throwing', () => {
    const errors = [];

    validateScreenContract(null, { screenId: 'broken', errors });

    expect(errors).toContain('Screen broken must be an object');
    expect(() => validateScreenContract(null)).not.toThrow();
  });
});
