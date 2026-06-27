import { describe, expect, it } from 'vitest';
import { migrateProfileTemplateFilletData } from './migrate-profile-template-fillets.js';

describe('profile template fillet migration', () => {
  it('rewrites legacy multi-vertex fillets into per-corner modifiers', () => {
    const result = migrateProfileTemplateFilletData({
      data: {
        parameters: { L: 90 },
        sketch: {
          points: [
            { id: 'p0', x: 0, y: 0 },
            { id: 'p1', x: 20, y: 0 },
            { id: 'p2', x: 20, y: 10 }
          ],
          edges: [
            { from: 'p0', to: 'p1' },
            { from: 'p1', to: 'p2' },
            { from: 'p2', to: 'p0' }
          ],
          modifiers: [{ type: 'fillet', vertices: ['p0', 'p2'], radius: 4 }]
        },
        occsProfile: {
          section: {
            modifiers: [{ type: 'fillet', vertices: ['p0', 'p2'], radius: 4 }]
          }
        }
      }
    });

    expect(result.changed).toBe(true);
    expect(result.data.sketch.modifiers).toEqual([
      { type: 'fillet', vertexId: 'p0', radius: 4 },
      { type: 'fillet', vertexId: 'p2', radius: 4 }
    ]);
    expect(result.data.occsProfile.section.modifiers).toEqual(result.data.sketch.modifiers);
  });
});
