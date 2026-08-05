import { describe, expect, it } from 'vitest';
import { getEntityConstruction } from './entity-construction.js';

describe('CNC entity construction', () => {
  it('creates cassettes only through the editable OCCS template constructor', () => {
    const contract = getEntityConstruction('cassette');

    expect(contract.defaultMode).toBe('createDefaultOccsTemplate');
    expect(contract.modes).toEqual(['createDefaultOccsTemplate']);
    expect(contract.modeInputs.createDefaultOccsTemplate).toMatchObject([
      { id: 'name', label: 'Template name', required: true }
    ]);
  });
});
