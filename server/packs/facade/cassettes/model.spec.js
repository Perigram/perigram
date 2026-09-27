import { describe, expect, it } from 'vitest';
import { Cassette } from './model.js';

describe('Cassette model', () => {
  it('serializes cassette fields only under canonical blocks', () => {
    const cassette = new Cassette({
      _id: 'cassette-1',
      identity: { uid: 'cassette-1', name: 'Panel' },
      data: {
        type: 'PARAMETRIC',
        definition: {
          params: { A: 600, B: 400 },
          extrusions: [{ edgeIndex: 0, param: 'C' }]
        },
        parameters: ['A', 'B', 'C']
      }
    }).toJSON();

    expect(cassette.data.definition).toEqual({
      params: { A: 600, B: 400 },
      extrusions: [{ edgeIndex: 0, param: 'C' }]
    });
    expect(cassette.data.parameters).toEqual(['A', 'B', 'C']);
    expect(cassette).not.toHaveProperty('definition');
    expect(cassette).not.toHaveProperty('parameters');
  });
});
