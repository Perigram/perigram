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

  it('joins array copies end-to-start with a zero spacing — no gap left between them', () => {
    // Spacing is the GAP between copies: zero butts them together, and
    // both copies still fit the 100mm edge at a 10mm margin (spans
    // 10-50 and 50-90; the shared joint point collapses).
    const embedding = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'spacing', spacing: '0' } }
    });
    expect(embedding.ok).toBe(true);
    expect(embedding.copies).toHaveLength(2);
    expect(embedding.composite).toEqual([
      [0, 0],
      [10, 0], [30, 10], [50, 0],
      [70, 10], [90, 0],
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
    expect(embedding.composite).toEqual([[0, 0], [20, -10], [40, 0], [100, 0]]);

    const mirrored = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { mirrorY: true, offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    expect(mirrored.ok).toBe(true);
    expect(mirrored.composite).toEqual([[0, 0], [10, 0], [30, -10], [50, 0], [100, 0]]);
  });

  it('count mode distributes whole copies across the usable span', () => {
    const embedding = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 5, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '2' } }
    });
    expect(embedding.ok).toBe(true);
    // Span 100 - 2*5 - 40 = 50; starts at 5 and 55: the first copy starts
    // at the margin, the last ends at edgeLength - margin.
    expect(embedding.copies).toHaveLength(2);
    expect(embedding.copies[0][0]).toEqual([5, 0]);
    expect(embedding.copies[1][embedding.copies[1].length - 1]).toEqual([95, 0]);
  });

  it('spacing packs whole copies with the requested gap between them', () => {
    const long = [[0, 0], [200, 0], [200, 50], [0, 50]];
    const startsFor = (spacing) => embedOccsProfileEdge({
      section: BUMP,
      vertices: long,
      relation: { offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'spacing', spacing } }
    });

    // A 20mm gap: 40mm chords at pitch 60 on the 140mm span left by the
    // margins — three copies packed from the margin, not stretched over
    // the edge.
    const gapped = startsFor('20');
    expect(gapped.ok).toBe(true);
    expect(gapped.copies.map(copy => [copy[0][0], copy[copy.length - 1][0]]))
      .toEqual([[10, 50], [70, 110], [130, 170]]);

    // The same span with a zero gap butts four copies together.
    const butted = startsFor('0');
    expect(butted.ok).toBe(true);
    expect(butted.copies.map(copy => [copy[0][0], copy[copy.length - 1][0]]))
      .toEqual([[10, 50], [50, 90], [90, 130], [130, 170]]);
  });

  it('end-bound arrays walk copies edge-start to edge-end like every binding', () => {
    // The binding places the array, never the direction the composite
    // chain runs: an end-anchored array must not trip the overlap
    // validation with descending copy starts. Both setups fit the
    // 100mm edge (margin 5, chord 40): two copies by count, two butted
    // together by zero spacing.
    for (const pattern of [
      { mode: 'count', count: '2' },
      { mode: 'spacing', spacing: '0' }
    ]) {
      const embedding = embedOccsProfileEdge({
        section: BUMP,
        vertices: FACE,
        relation: { offsetX: 5, targetSnap: 'end', pattern: { type: 'edgeArray', edge: 'E0', ...pattern } }
      });
      expect(embedding.ok).toBe(true);
      const starts = embedding.copies.map(copy => copy[0][0]);
      expect([...starts].sort((left, right) => left - right)).toEqual(starts);
      expect(embedding.composite[0]).toEqual([0, 0]);
      expect(embedding.composite[embedding.composite.length - 1]).toEqual([100, 0]);
    }

    // Three 40mm chords cannot fit the span — the refusal is the
    // honest physical answer, not the binding.
    const impossible = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 5, targetSnap: 'end', pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '3' } }
    });
    expect(impossible.ok).toBe(false);
    expect(impossible.reason).toMatch(/overlaps copy 2/);
  });

  it('forbids overflowing and overlapping copies', () => {
    const longBump = { vertices: [[0, 0], [30, 15], [60, 0]], open: true };
    const overflow = embedOccsProfileEdge({
      section: longBump,
      vertices: FACE,
      relation: { offsetX: 50, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' } }
    });
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toMatch(/too short/);

    // Count mode is the one that can ask for more copies than the span
    // holds; spacing mode only ever places what fits.
    const overlap = embedOccsProfileEdge({
      section: BUMP,
      vertices: FACE,
      relation: { offsetX: 10, pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '3' } }
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
    expect(result.errors).toEqual(['edge too short for the profile at this margin']);
    expect(result.applied).toHaveLength(1);
    expect(result.contour).toEqual([
      [0, 0], [10, 0], [30, 10], [50, 0], [100, 0], [100, 50], [0, 50]
    ]);
  });
});
