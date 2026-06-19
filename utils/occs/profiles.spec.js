import { describe, expect, it } from 'vitest';
import {
  createDefaultOccsProfileSketch,
  evaluateOccsProfileSketchPreview,
  occsProfileFromSketch
} from './profiles.js';

describe('OCCS profile helpers', () => {
  it('exports a sketch as an OCCS profile section with circle holes and fillets', () => {
    const sketch = createDefaultOccsProfileSketch();
    const profile = occsProfileFromSketch(sketch);

    expect(profile.section).toMatchObject({
      type: 'polygon',
      vertices: [['0', '0'], ['W', '0'], ['W', 'H'], ['0', 'H']],
      holes: [{ type: 'circle', center: ['W / 2', 'H / 2'], diameter: 'D' }],
      modifiers: [{ type: 'fillet', vertices: ['p0', 'p1', 'p2', 'p3'], radius: 'R' }]
    });
    expect(profile.sweep).toEqual({ type: 'linear', length: 'L' });
  });

  it('evaluates preview coordinates without mutating expression storage', () => {
    const sketch = createDefaultOccsProfileSketch({ W: '50', H: '20', D: '10' });
    const preview = evaluateOccsProfileSketchPreview(sketch);

    expect(preview.points.find(point => point.id === 'p2')).toMatchObject({
      x: 'W',
      y: 'H',
      xValue: 50,
      yValue: 20
    });
    expect(preview.holes[0]).toMatchObject({
      centerValue: [25, 10],
      diameterValue: 10
    });
  });
});

