import { describe, expect, it } from 'vitest';
import { getEntityConstruction } from './entity-construction.js';

describe('CNC entity construction', () => {
  it('keeps generic cassette creation as the block-authored default', () => {
    const contract = getEntityConstruction('cassette');

    expect(contract.defaultMode).toBe('genericCreate');
    expect(contract.modes).toEqual(['genericCreate', 'createDefaultOccsTemplate']);
    expect(contract.modeInputs.genericCreate).toEqual([]);
    expect(contract.modeInputs.createDefaultOccsTemplate).toMatchObject([
      { id: 'name', label: 'Template name', required: true }
    ]);
  });
});
