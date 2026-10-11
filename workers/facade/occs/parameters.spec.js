import { describe, expect, it } from 'vitest';
import { occsParameterNames, occsQueueParameters } from './parameters.js';

describe('OCCS parameter helpers', () => {
  it('extracts queue parameters from OCCS documents', () => {
    const definition = {
      occs: '0.4-draft',
      documentType: 'template',
      parameters: { A: '500', B: '400', R: '35' }
    };

    expect(occsParameterNames(definition)).toEqual(['A', 'B', 'R']);
    expect(occsQueueParameters(definition)).toEqual({ A: 500, B: 400, R: 35 });
  });

  it('keeps legacy cassette params compatible', () => {
    const definition = { params: { A: '700', label: 'left' }, extrusions: [] };

    expect(occsParameterNames(definition)).toEqual(['A', 'label']);
    expect(occsQueueParameters(definition)).toEqual({ A: 700, label: 'left' });
  });
});
