import { describe, expect, it } from 'vitest';
import { buildProfileAnnotations } from './profileAnnotations.js';

const evaluated = {
  shapes: [{ id: 's0', type: 'rect', center: [10, 5], width: 20, height: 10, rotation: 0, fillets: [] }]
};

describe('profile annotations', () => {
  it('draws the profile axis across the placed face', () => {
    const { decorations } = buildProfileAnnotations({ evaluated, axisStart: -40, axisEnd: 40 });
    const axis = decorations.find(item => item.type === 'poly' && item.closed === false);

    expect(axis.pts).toEqual([{ x: 0, y: -40 }, { x: 0, y: 40 }]);
    expect(decorations.some(item => item.type === 'xline')).toBe(false);
  });

  it('draws the parent face as a ghost outline in face mode', () => {
    const parentFace = [[-10, 0], [30, 0], [30, -40], [-10, -40]];
    const { decorations } = buildProfileAnnotations({
      evaluated,
      basisStart: -10,
      basisEnd: 30,
      contextFace: parentFace
    });
    const ghost = decorations.find(item => item.type === 'poly' && item.closed === true);

    expect(ghost.pts).toEqual(parentFace.map(([x, y]) => ({ x, y })));
  });

  it('draws the parent edge as the face basis line', () => {
    const { decorations } = buildProfileAnnotations({
      evaluated,
      basisStart: -10,
      basisEnd: 30
    });
    const basis = decorations.find(item => item.type === 'poly' && item.closed === false);

    expect(basis.pts).toEqual([{ x: -10, y: 0 }, { x: 30, y: 0 }]);
    expect(decorations.some(item => item.type === 'xline')).toBe(false);
  });
});
