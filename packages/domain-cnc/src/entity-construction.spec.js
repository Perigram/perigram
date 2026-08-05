import { describe, expect, it } from 'vitest';
import { getEntityConstruction } from './entity-construction.js';

describe('CNC entity construction', () => {
  it('treats cassette creation as an ordinary entity create contract', () => {
    const contract = getEntityConstruction('cassette');

    expect(contract.defaultMode).toBe('genericCreate');
    expect(contract.modes).toEqual(['genericCreate']);
    expect(contract.inputs).toEqual([]);
  });
});
