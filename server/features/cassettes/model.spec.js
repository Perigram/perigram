import { describe, expect, it } from 'vitest';
import { Cassette } from './model.js';

describe('Cassette model', () => {
  it('normalizes legacy direct parametric graph fields into definition', () => {
    const cassette = new Cassette({
      _id: 'cassette-1',
      identity: { uid: 'cassette-1', name: 'Panel' },
      data: {
        type: 'PARAMETRIC',
        params: { A: 600, B: 400 },
        extrusions: [{ edgeIndex: 0, param: 'C' }],
        parameters: ['A', 'B', 'C']
      }
    }).toJSON();

    expect(cassette.definition).toEqual({
      params: { A: 600, B: 400 },
      extrusions: [{ edgeIndex: 0, param: 'C' }]
    });
    expect(cassette.parameters).toEqual(['A', 'B', 'C']);
  });
});
