import { describe, expect, it } from 'vitest';
import { embedOccsProfileEdge, embedOccsProfilesIntoContour } from './profileEmbedding.js';

const FACE = [[0, 0], [100, 0], [100, 50], [0, 50]];
// An open profile chain: a bump whose anchors sit 40 apart.
const BUMP = { vertices: [[0, 0], [20, 10], [40, 0]], open: true };

describe('embedOccsProfileEdge', () => {
  it('replaces the whole edge: host start, straight run, chain, straight run, host end', () => {
    const embedding = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    expect(embedding.ok).toBe(true);
    expect(embedding.copies).toHaveLength(1);
    expect(embedding.composite).toEqual([
      [0, 0],
      [10, 0], [30, 10], [50, 0],
      [100, 0]
    ]);
    expect(embedding.breakPoints).toEqual([[10, 0], [50, 0]]);
  });

  it('joins array copies end-to-start with straight runs', () => {
    const embedding = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'spacing', spacing: '45' } }
    });
    expect(embedding.ok).toBe(true);
    expect(embedding.copies).toHaveLength(2);
    expect(embedding.composite).toEqual([
      [0, 0],
      [10, 0], [30, 10], [50, 0],
      [55, 0], [75, 10], [95, 0],
      [100, 0]
    ]);
  });

  it('orients the chain chord along the edge and honors mirrors', () => {
    // Authored chord runs along +y; the embedding rotates it onto +x
    // (the interior bump ends up below the edge).
    const vertical = { vertices: [[0, 0], [10, 20], [0, 40]], open: true };
    const embedding = embedOccsProfileEdge({
      section: vertical,
      vertices: FACE,
      relation: { offsetX: 0, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    expect(embedding.ok).toBe(true);
    expect(embedding.composite).toEqual([[0, 0], [0, 0], [20, -10], [40, 0], [100, 0]]);

    const mirrored = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { mirrorY: true, offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    expect(mirrored.ok).toBe(true);
    expect(mirrored.composite).toEqual([[0, 0], [10, 0], [30, -10], [50, 0], [100, 0]]);
  });

  it('forbids overflowing and overlapping copies', () => {
    const longBump = { vertices: [[0, 0], [30, 15], [60, 0]], open: true };
    const overflow = embedOccsProfileEdge({
      section: longBump,
      vertices: FACE,
      relation: { offsetX: 50, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toMatch(/past the host edge end/);

    const overlap = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 35, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '2' } }
    });
    expect(overlap.ok).toBe(false);
    expect(overlap.reason).toMatch(/overlaps copy 2/);
  });
});

describe('embedOccsProfilesIntoContour', () => {
  it('splices embeddings into the contour and collects failures', () => {
    const good = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    const longBump = { vertices: [[0, 0], [30, 15], [60, 0]], open: true };
    const bad = embedOccsProfileEdge({
      section: longBump,
      vertices: FACE,
      relation: { offsetX: 50, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    const result = embedOccsProfilesIntoContour(FACE, [good, bad]);
    expect(result.errors).toEqual(['copy 1 runs past the host edge end']);
    expect(result.applied).toHaveLength(1);
    expect(result.contour).toEqual([
      [0, 0], [10, 0], [30, 10], [50, 0], [100, 0], [100, 50], [0, 50]
    ]);
  });
});
