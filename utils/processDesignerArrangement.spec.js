// Layered-arrangement contract (canonical home:
// "Auto-arrangement"): the pure
// Tidy pass — deterministic, idempotent, lane-preserving, flow-directed.
import { describe, expect, it } from 'vitest';
import { arrangeProcessGraph, deriveLaneFacts, laneContainerLayout } from '~/utils/processDesignerArrangement.js';

const BAND_A = { id: 'role:a', kind: 'role', label: 'A', top: 0, height: 340 };
const BAND_B = { id: 'role:b', kind: 'role', label: 'B', top: 340, height: 340 };
const BAND_C = { id: 'role:c', kind: 'role', label: 'C', top: 680, height: 340 };

function processNode(id, x, y) {
  return { id, type: 'processNode', position: { x, y } };
}

function declarationNode(id, type, x, y) {
  return { id, type, position: { x, y } };
}

function arrangeFull({ nodes, edges, effects, bands = [BAND_A, BAND_B], bandOfNodeId }) {
  return arrangeProcessGraph({
    nodes,
    edges,
    effectIds: new Set(effects),
    bands,
    bandOfNodeId
  });
}

function arrange(options) {
  return arrangeFull(options).positions;
}

describe('arrangeProcessGraph', () => {
  it('returns nothing for an empty graph', () => {
    expect(arrange({ nodes: [], edges: [], effects: [], bandOfNodeId: new Map() }).size).toBe(0);
  });

  it('seats a declaration-only graph inside lanes', () => {
    const nodes = [declarationNode('cls', 'ctsClass', 10, 20), declarationNode('fld', 'ctsField', 30, 40)];
    const result = arrangeFull({
      nodes,
      edges: [{ source: 'fld', target: 'cls', role: 'type' }],
      effects: [],
      bandOfNodeId: new Map()
    });
    for (const node of nodes) {
      const point = result.positions.get(node.id);
      const inside = result.bands.filter(band => point.y >= band.top && point.y + 96 <= band.top + band.height);
      expect(inside).toHaveLength(1);
    }
  });

  it('seats a declaration cluster in the anchor effect\'s lane regardless of node order', () => {
    // The declaration cards precede their anchor in the nodes array and
    // author-position near the top lanes; the cluster still rides the
    // granted construct's lane (order-independent band assignment).
    const nodes = [
      declarationNode('card', 'ctsType', -60, 40),
      processNode('eff', 300, 40),
      declarationNode('clsA', 'ctsClass', -60, 110),
      declarationNode('fldA', 'ctsField', -60, 180),
      declarationNode('clsB', 'ctsClass', -60, 250),
      declarationNode('fldB', 'ctsField', -60, 320)
    ];
    const edges = [
      { source: 'card', target: 'eff', role: 'type', label: 'type' },
      { source: 'fldA', target: 'clsA', role: 'type', label: 'field' },
      { source: 'fldB', target: 'clsB', role: 'type', label: 'field' },
      { source: 'card', target: 'clsA', role: 'type', label: 'children' },
      { source: 'card', target: 'clsB', role: 'type', label: 'children' }
    ];
    const result = arrangeFull({
      nodes,
      edges,
      effects: ['eff'],
      bands: [BAND_A, BAND_B, BAND_C],
      bandOfNodeId: new Map([['eff', BAND_C]])
    });
    const band = result.bands[2];
    for (const node of nodes) {
      const point = result.positions.get(node.id);
      const card = node.type === 'processNode' ? 140 : 96;
      expect(point.y).toBeGreaterThanOrEqual(band.top);
      expect(point.y + card).toBeLessThanOrEqual(band.top + band.height);
    }
  });

  it('bounds the median polish by the lane\'s stacked rows', () => {
    // The same wired cluster chases its own medians; the polish may only
    // redistribute inside the stacked extent (5 rows at the 156 pitch,
    // 96-tall declaration cards, insets and padding).
    const nodes = [
      declarationNode('card', 'ctsType', -60, 1900),
      processNode('eff', 300, 1900),
      declarationNode('clsA', 'ctsClass', -60, 1970),
      declarationNode('fldA', 'ctsField', -60, 2040),
      declarationNode('clsB', 'ctsClass', -60, 2110),
      declarationNode('fldB', 'ctsField', -60, 2250)
    ];
    const edges = [
      { source: 'card', target: 'eff', role: 'type', label: 'type' },
      { source: 'fldA', target: 'clsA', role: 'type', label: 'field' },
      { source: 'fldB', target: 'clsB', role: 'type', label: 'field' },
      { source: 'card', target: 'clsA', role: 'type', label: 'children' }
    ];
    const result = arrangeFull({
      nodes,
      edges,
      effects: ['eff'],
      bands: [BAND_A, BAND_B, BAND_C],
      bandOfNodeId: new Map([['eff', BAND_C]])
    });
    expect(result.bands[2].height).toBeLessThanOrEqual(24 + 4 * 156 + 140 + 24 + 16);
    const again = arrangeFull({
      nodes: nodes.map(node => ({ ...node, position: result.positions.get(node.id) })),
      edges,
      effects: ['eff'],
      bands: [BAND_A, BAND_B, BAND_C],
      bandOfNodeId: new Map([['eff', BAND_C]])
    });
    expect([...again.positions.entries()]).toEqual([...result.positions.entries()]);
  });

  it('keeps flow direction: every acyclic flow edge reads left-to-right', () => {
    const nodes = [
      processNode('src', 0, 0),
      processNode('mid', 0, 0),
      processNode('eff', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'src', target: 'mid' },
        { source: 'mid', target: 'eff', role: 'control' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    const p = id => result.get(id);
    expect(p('src').x).toBeLessThan(p('mid').x);
    expect(p('mid').x).toBeLessThan(p('eff').x);
    expect(p('eff').x - p('mid').x).toBe(p('mid').x - p('src').x);
  });

  it('tolerates a transient authoring cycle without hanging', () => {
    const nodes = [processNode('c1', 0, 0), processNode('c2', 0, 0), processNode('c3', 0, 0)];
    const edges = [
      { source: 'c1', target: 'c2', role: 'control' },
      { source: 'c2', target: 'c3', role: 'control' },
      { source: 'c3', target: 'c1', role: 'control' }
    ];
    const result = arrange({
      nodes,
      edges,
      effects: ['c1', 'c2', 'c3'],
      bandOfNodeId: new Map([['c1', BAND_A], ['c2', BAND_A], ['c3', BAND_B]])
    });
    // Exactly the cycle-closing edge may read right-to-left; the other
    // two stay monotone.
    const backwards = edges.filter(edge => result.get(edge.source).x >= result.get(edge.target).x);
    expect(backwards).toHaveLength(1);
  });

  it('reads a same-lane sequence horizontally on one row', () => {
    const nodes = [
      processNode('a1', 900, 0), processNode('a2', 500, 0), processNode('a3', 100, 0)
    ];
    const band = { id: 'role:a', kind: 'role', label: 'A', top: 0, height: 340 };
    const result = arrange({
      nodes,
      edges: [
        { source: 'a1', target: 'a2', role: 'control' },
        { source: 'a2', target: 'a3', role: 'control' }
      ],
      effects: ['a1', 'a2', 'a3'],
      bands: [band],
      bandOfNodeId: new Map([['a1', band], ['a2', band], ['a3', band]])
    });
    const ys = ['a1', 'a2', 'a3'].map(id => result.get(id).y);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(band.top);
      expect(y).toBeLessThan(band.top + band.height);
    }
    // One member per column: the chain must not read as a staircase.
    expect(new Set(ys).size).toBe(1);
  });

  it('sits unwired nodes side by side on one row', () => {
    const nodes = [processNode('r1', 0, 0), processNode('r2', 0, 0)];
    const band = { id: 'role:a', kind: 'role', label: 'A', top: 0, height: 340 };
    const result = arrange({
      nodes,
      edges: [],
      effects: ['r1', 'r2'],
      bands: [band],
      bandOfNodeId: new Map([['r1', band], ['r2', band]])
    });
    const [first, second] = ['r1', 'r2'].map(id => result.get(id)).sort((a, b) => a.x - b.x);
    expect(second.x - first.x).toBeGreaterThanOrEqual(360);
    expect(second.y).toBe(first.y);
  });

  it('packs unwired clusters beside the wired flow', () => {
    const nodes = [
      processNode('a', 0, 0), processNode('b', 0, 0),
      processNode('c', 0, 0), processNode('d', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'a', target: 'b' },
        { source: 'c', target: 'd' }
      ],
      effects: ['a', 'b', 'c', 'd'],
      bandOfNodeId: new Map([['a', BAND_A], ['b', BAND_A], ['c', BAND_A], ['d', BAND_A]])
    });
    expect(result.get('b').x).toBeGreaterThan(result.get('a').x);
    expect(result.get('c').x).toBeGreaterThanOrEqual(result.get('b').x);
    expect(result.get('d').x).toBeGreaterThan(result.get('c').x);
  });

  it('keeps an unbanded effect where the author left it', () => {
    const result = arrange({
      nodes: [processNode('stray', 77, 88)],
      edges: [],
      effects: ['stray'],
      bandOfNodeId: new Map()
    });
    expect(result.has('stray')).toBe(false);
  });

  it('barycenter ordering untangles a crossing two-lane chain', () => {
    // Authored rows deliberately cross: a1 below a2 wires up while a2
    // wires down. After tidy the per-band orders must agree in sign.
    const nodes = [
      processNode('a1', 0, 500), processNode('a2', 0, 0),
      processNode('b1', 0, 0), processNode('b2', 0, 500)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'a1', target: 'b1', role: 'control' },
        { source: 'a2', target: 'b2', role: 'control' }
      ],
      effects: ['a1', 'a2', 'b1', 'b2'],
      bandOfNodeId: new Map([['a1', BAND_A], ['a2', BAND_A], ['b1', BAND_B], ['b2', BAND_B]])
    });
    const signA = Math.sign(result.get('a1').y - result.get('a2').y);
    const signB = Math.sign(result.get('b1').y - result.get('b2').y);
    // The two wires cross iff the per-band orders disagree; equal orders
    // (including both level) is the untangled arrangement.
    expect(signA).toBe(signB);
  });

  it('pulls a pred-less source up to its first consumer\'s column', () => {
    const nodes = [
      processNode('all', 0, 0),
      processNode('getField', 0, 0),
      processNode('filter', 0, 0),
      processNode('create', 0, 0),
      processNode('literal', 0, 0),
      processNode('transition', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'all', target: 'getField' },
        { source: 'getField', target: 'filter' },
        { source: 'filter', target: 'create' },
        { source: 'literal', target: 'transition' },
        { source: 'create', target: 'transition', role: 'control' }
      ],
      effects: ['create', 'transition'],
      bandOfNodeId: new Map([['create', BAND_A], ['transition', BAND_B]])
    });
    // transition waits for create (layer 3); the literal must not strand
    // at column 0 behind three empty columns — it joins create's column,
    // adjacent to its consumer.
    expect(result.get('literal').x).toBe(result.get('create').x);
    expect(result.get('literal').x).toBeGreaterThan(0);
  });

  it('clamps a fan-out secondary into its anchor band', () => {
    const nodes = [processNode('src', 0, 0), processNode('eA', 0, 0), processNode('eB', 0, 0)];
    const result = arrangeFull({
      nodes,
      edges: [
        { source: 'src', target: 'eA' },
        { source: 'src', target: 'eB' }
      ],
      effects: ['eA', 'eB'],
      bandOfNodeId: new Map([['eA', BAND_A], ['eB', BAND_B]])
    });
    const bandA = result.bands.find(band => band.id === BAND_A.id);
    const src = result.positions.get('src');
    expect(src.y).toBeGreaterThanOrEqual(bandA.top);
    expect(src.y + 140).toBeLessThanOrEqual(bandA.top + bandA.height);
  });

  it('hugs band bounds to content and never crosses a divider', () => {
    const nodes = [
      processNode('eA1', 0, 0), processNode('eA2', 0, 0), processNode('eB1', 0, 0),
      processNode('src', 0, 0), processNode('helper', 0, 0),
      declarationNode('cls', 'ctsClass', 0, 0)
    ];
    const bandC = { id: 'role:c', kind: 'role', label: 'C', top: 0, height: 0 };
    const result = arrangeFull({
      nodes,
      edges: [
        { source: 'eA1', target: 'eA2', role: 'control' },
        { source: 'src', target: 'eA1' },
        { source: 'helper', target: 'eB1' },
        { source: 'cls', target: 'eA1', role: 'type' }
      ],
      effects: ['eA1', 'eA2', 'eB1'],
      bands: [BAND_A, bandC, BAND_B],
      bandOfNodeId: new Map([['eA1', BAND_A], ['eA2', BAND_A], ['eB1', BAND_B]])
    });
    // Empty role keeps the minimum height; bands stack in role order.
    const bandA = result.bands[0];
    const empty = result.bands[1];
    const bandB = result.bands[2];
    expect(empty.height).toBe(150);
    expect(bandA.top).toBe(0);
    expect(empty.top).toBe(bandA.top + bandA.height);
    expect(bandB.top).toBe(empty.top + empty.height);
    // Every arranged node sits fully inside exactly one band (card
    // heights: 140 process, 96 declaration) — nothing crosses a divider.
    const cardHeightOf = node => (node.type === 'processNode' ? 140 : 96);
    for (const node of nodes) {
      const point = result.positions.get(node.id);
      const inside = result.bands.filter(band => (
        point.y >= band.top && point.y + cardHeightOf(node) <= band.top + band.height
      ));
      expect(inside).toHaveLength(1);
    }
    // Content hugging: height exceeds its content bottom by at most the
    // padding (24), never a long empty tail.
    for (const band of [bandA, bandB]) {
      const members = nodes.filter(node => {
        const point = result.positions.get(node.id);
        return point.y >= band.top && point.y + cardHeightOf(node) <= band.top + band.height;
      });
      const contentBottom = Math.max(...members.map(node => (
        result.positions.get(node.id).y - band.top + cardHeightOf(node)
      )));
      expect(band.height).toBeGreaterThanOrEqual(contentBottom);
      expect(band.height - contentBottom).toBeLessThanOrEqual(24);
    }
  });

  it('spreads same-column secondaries clear of each other', () => {
    const nodes = [processNode('s1', 0, 0), processNode('s2', 0, 0), processNode('eff', 0, 0)];
    const result = arrange({
      nodes,
      edges: [
        { source: 's1', target: 'eff' },
        { source: 's2', target: 'eff' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    expect(Math.abs(result.get('s1').y - result.get('s2').y)).toBeGreaterThanOrEqual(150);
  });

  it('stacks secondary nodes near their downstream effect consumer', () => {
    const nodes = [
      processNode('src', 0, 0),
      processNode('read', 0, 0),
      processNode('eff', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'src', target: 'read' },
        { source: 'read', target: 'eff' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    const eff = result.get('eff');
    for (const id of ['src', 'read']) {
      const point = result.get(id);
      expect(point.x).toBeLessThan(eff.x);
      expect(Math.abs(point.y - eff.y)).toBeLessThanOrEqual(120);
    }
    expect(result.get('src').x).toBeLessThan(result.get('read').x);
  });

  it('seats a chainless secondary inside a lane', () => {
    const result = arrangeFull({
      nodes: [processNode('island', 12, 345), processNode('eff', 0, 0)],
      edges: [],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    const point = result.positions.get('island');
    const inside = result.bands.filter(band => point.y >= band.top && point.y + 140 <= band.top + band.height);
    expect(inside).toHaveLength(1);
  });

  it('never overlaps cards in the same column', () => {
    const nodes = [
      processNode('eff', 0, 0),
      processNode('src', 0, 0),
      processNode('other', 0, 0),
      declarationNode('cls', 'ctsClass', 0, 0)
    ];
    const result = arrangeFull({
      nodes,
      edges: [
        { source: 'src', target: 'eff' },
        { source: 'other', target: 'eff' },
        { source: 'cls', target: 'eff', role: 'type' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    // src, other (both feeding eff, column 0) and the declaration (column
    // 0) must stack clear of each other; eff itself is at column 1.
    const byX = new Map();
    for (const node of nodes) {
      const point = result.positions.get(node.id);
      const card = { id: node.id, y: point.y, h: node.type === 'processNode' ? 140 : 96 };
      byX.set(point.x, [...(byX.get(point.x) || []), card]);
    }
    for (const cards of byX.values()) {
      cards.sort((left, right) => left.y - right.y);
      for (let index = 1; index < cards.length; index += 1) {
        expect(cards[index].y).toBeGreaterThanOrEqual(cards[index - 1].y + cards[index - 1].h);
      }
    }
    expect(byX.get(0).length).toBe(3);
    const secondColumnX = result.positions.get('eff').x;
    expect(secondColumnX).toBeGreaterThan(0);
    expect(byX.get(secondColumnX).length).toBe(1);
  });

  it('anchors a declaration cluster one column left of its bound process node', () => {
    const nodes = [
      declarationNode('cls', 'ctsClass', 0, 0),
      declarationNode('fld', 'ctsField', 0, 0),
      processNode('eff', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'fld', target: 'cls', role: 'type' },
        { source: 'cls', target: 'eff', role: 'type' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    const eff = result.get('eff');
    for (const id of ['cls', 'fld']) {
      const point = result.get(id);
      expect(point.x).toBeLessThan(eff.x);
      expect(Math.abs(point.y - eff.y)).toBeLessThanOrEqual(140);
    }
    expect(result.get('cls').x).toBe(result.get('fld').x);
  });

  it('seats a declaration island inside a lane on the column grid', () => {
    const nodes = [
      declarationNode('isoCls', 'ctsClass', 41, 42),
      declarationNode('isoFld', 'ctsField', 43, 44),
      processNode('eff', 0, 0)
    ];
    const result = arrangeFull({
      nodes,
      edges: [
        { source: 'isoFld', target: 'isoCls', role: 'type' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    for (const id of ['isoCls', 'isoFld']) {
      const point = result.positions.get(id);
      expect(point.x).toBeGreaterThanOrEqual(0);
      const inside = result.bands.filter(band => point.y >= band.top && point.y + 96 <= band.top + band.height);
      expect(inside).toHaveLength(1);
    }
  });

  it('is deterministic and idempotent over its own output', () => {
    const input = {
      nodes: [
        processNode('a1', 640, 500), processNode('a2', 0, 0),
        processNode('b1', 700, 0), processNode('b2', 60, 500),
        processNode('src', 0, 0), declarationNode('cls', 'ctsClass', 0, 0)
      ],
      edges: [
        { source: 'a1', target: 'b1', role: 'control' },
        { source: 'a2', target: 'b2', role: 'control' },
        { source: 'src', target: 'a1' },
        { source: 'cls', target: 'a1', role: 'type' }
      ],
      effects: ['a1', 'a2', 'b1', 'b2'],
      bandOfNodeId: new Map([['a1', BAND_A], ['a2', BAND_A], ['b1', BAND_B], ['b2', BAND_B]])
    };
    const first = arrangeFull(input);
    expect(arrangeFull(input)).toEqual(first);
    const second = arrangeFull({
      ...input,
      nodes: input.nodes.map(node => (
        first.positions.has(node.id) ? { ...node, position: first.positions.get(node.id) } : node
      ))
    });
    expect([...second.positions]).toEqual([...first.positions]);
    expect(second.bands).toEqual(first.bands);
  });

  it('is idempotent on a fan-out graph with a deep chain', () => {
    const input = {
      nodes: [
        processNode('all', 1200, 1800), processNode('getField', 300, 1900),
        processNode('filter', 2000, 1750), processNode('literal', 0, 1500),
        processNode('create', 500, 50), processNode('transition', 900, 420),
        processNode('command', 1500, 100)
      ],
      edges: [
        { source: 'all', target: 'getField' },
        { source: 'getField', target: 'filter' },
        { source: 'filter', target: 'create' },
        { source: 'literal', target: 'transition' },
        { source: 'getField', target: 'transition' },
        { source: 'all', target: 'command' },
        { source: 'create', target: 'transition', role: 'control' }
      ],
      effects: ['create', 'transition', 'command'],
      bandOfNodeId: new Map([['create', BAND_A], ['command', BAND_A], ['transition', BAND_B]])
    };
    const first = arrange(input);
    const fedBack = input.nodes.map(node => (
      first.has(node.id) ? { ...node, position: first.get(node.id) } : node
    ));
    const second = arrange({ ...input, nodes: fedBack });
    expect([...second]).toEqual([...first]);
    const third = arrange({ ...input, nodes: input.nodes.map(node => (
      second.has(node.id) ? { ...node, position: second.get(node.id) } : node
    )) });
    expect([...third]).toEqual([...first]);
  });

  it('aligns a three-column crossing chain onto shared rows', () => {
    const nodes = [
      processNode('a1', 0, 500), processNode('a2', 0, 0),
      processNode('m1', 420, 500), processNode('m2', 420, 0),
      processNode('b1', 840, 0), processNode('b2', 840, 500)
    ];
    const input = {
      nodes,
      edges: [
        { source: 'a1', target: 'm1' },
        { source: 'a2', target: 'm2' },
        { source: 'm1', target: 'b1' },
        { source: 'm2', target: 'b2' }
      ],
      effects: ['a1', 'a2', 'm1', 'm2', 'b1', 'b2'],
      bandOfNodeId: new Map([
        ['a1', BAND_A], ['a2', BAND_A], ['m1', BAND_A], ['m2', BAND_A],
        ['b1', BAND_B], ['b2', BAND_B]
      ])
    };
    const result = arrange(input);
    const signs = [
      Math.sign(result.get('a1').y - result.get('a2').y),
      Math.sign(result.get('m1').y - result.get('m2').y),
      Math.sign(result.get('b1').y - result.get('b2').y)
    ];
    expect(new Set(signs).size).toBe(1);
    const rerun = arrange({ ...input, nodes: input.nodes.map(node => (
      result.has(node.id) ? { ...node, position: result.get(node.id) } : node
    )) });
    expect([...rerun]).toEqual([...result]);
  });

  it('seats a pulled-up source on its far consumer\'s row', () => {
    const nodes = [
      processNode('src', 0, 0),
      processNode('effTop', 0, 0), processNode('eff', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'src', target: 'eff' },
        { source: 'effTop', target: 'eff', role: 'control' }
      ],
      effects: ['eff', 'effTop'],
      bandOfNodeId: new Map([['eff', BAND_A], ['effTop', BAND_A]])
    });
    expect(result.get('src').x).toBe(result.get('effTop').x);
    expect(Math.abs(result.get('src').y - result.get('eff').y)).toBeLessThan(170);
  });

  it('packs columns to card widths, not a fixed pitch', () => {
    const wide = { id: 'w', type: 'processNode', position: { x: 0, y: 0 }, dimensions: { width: 300, height: 140 } };
    const narrow = { id: 'n', type: 'processNode', position: { x: 0, y: 0 }, dimensions: { width: 160, height: 140 } };
    const result = arrange({
      nodes: [wide, narrow],
      edges: [{ source: 'w', target: 'n' }],
      effects: ['w', 'n'],
      bandOfNodeId: new Map([['w', BAND_A], ['n', BAND_A]])
    });
    const span = result.get('n').x - result.get('w').x;
    expect(span).toBeGreaterThanOrEqual(300 + 16);
    expect(span).toBeLessThanOrEqual(420);
  });

  it('seats loop mates on one column', () => {
    const nodes = [
      processNode('head', 0, 0), processNode('closer', 0, 0),
      processNode('next', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'head', target: 'closer' },
        { source: 'closer', target: 'head', role: 'control' },
        { source: 'closer', target: 'next' }
      ],
      effects: ['head', 'closer', 'next'],
      bandOfNodeId: new Map([['head', BAND_A], ['closer', BAND_A], ['next', BAND_A]])
    });
    expect(result.get('head').x).toBe(result.get('closer').x);
    expect(result.get('next').x).toBeGreaterThan(result.get('head').x);
  });

  it('holds lane geometry stable against cross-band wires', () => {
    const nodes = [
      processNode('a1', 0, 0), processNode('a2', 0, 0),
      processNode('c', 0, 0)
    ];
    const result = arrangeFull({
      nodes,
      edges: [{ source: 'a1', target: 'c' }],
      effects: ['a1', 'a2', 'c'],
      bands: [BAND_A, BAND_B, BAND_C_BAND()],
      bandOfNodeId: new Map([['a1', BAND_A], ['a2', BAND_A], ['c', BAND_C_BAND()]])
    });
    const [bandA, , bandC] = result.bands;
    expect(bandA.height).toBeLessThanOrEqual(150 + 2 * 170);
    expect(result.positions.get('c').y).toBeLessThan(bandC.top + 400);
  });

  it('spreads a mutually-evented trio across columns', () => {
    const nodes = [processNode('a', 0, 0), processNode('b', 0, 0), processNode('c', 0, 0)];
    const result = arrange({
      nodes,
      edges: [
        { source: 'a', target: 'b', role: 'control' },
        { source: 'b', target: 'a', role: 'control' },
        { source: 'b', target: 'c', role: 'control' },
        { source: 'c', target: 'b', role: 'control' },
        { source: 'c', target: 'a', role: 'control' }
      ],
      effects: ['a', 'b', 'c'],
      bandOfNodeId: new Map([['a', BAND_A], ['b', BAND_A], ['c', BAND_A]])
    });
    const xs = new Set(['a', 'b', 'c'].map(id => result.get(id).x));
    expect(xs.size).toBe(3);
    expect(result.get('b').x).toBeGreaterThan(result.get('a').x);
    expect(result.get('c').x).toBeGreaterThan(result.get('b').x);
  });
});

function BAND_C_BAND() {
  return { id: 'role:c', kind: 'role', label: 'C', top: 680, height: 340 };
}

describe('laneContainerLayout', () => {
  const BANDS = ['role:a', 'role:b', 'unassigned'];
  const membershipOf = node => node.lane;
  const laneYOf = node => node.laneY;

  it('hugs each band around its content and stacks in order', () => {
    const { bands, positions } = laneContainerLayout({
      nodes: [
        { id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'a2', lane: 'role:a', laneY: 400, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'b1', lane: 'role:b', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }
      ],
      bandIds: BANDS,
      membershipOf,
      laneYOf
    });
    // band a: content bottoms at 400 + 140, plus the bottom inset
    expect(bands[0]).toEqual({ id: 'role:a', top: 0, height: 400 + 140 + 24 });
    expect(bands[1].top).toBe(bands[0].height);
    expect(bands[2].top).toBe(bands[0].height + bands[1].height);
    expect(positions.get('b1')).toBe(bands[1].top + 24);
  });

  it('members ride their band when a band above grows', () => {
    const base = laneContainerLayout({
      nodes: [{ id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'b1', lane: 'role:b', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    const grown = laneContainerLayout({
      nodes: [{ id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'a2', lane: 'role:a', laneY: 400, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'b1', lane: 'role:b', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    const shift = grown.bands[1].top - base.bands[1].top;
    expect(shift).toBeGreaterThan(0);
    expect(grown.positions.get('b1')).toBe(base.positions.get('b1') + shift);
    expect(grown.laneY.get('b1')).toBe(24);
  });

  it('seats content at the top inset without breaking lane-mate offsets', () => {
    const { laneY, positions, bands } = laneContainerLayout({
      nodes: [{ id: 'a1', lane: 'role:a', laneY: 60, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'a2', lane: 'role:a', laneY: 400, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    expect(laneY.get('a1')).toBe(24);
    expect(laneY.get('a2')).toBe(364); // same 340px gap to its lane-mate
    expect(positions.get('a2')).toBe(364);
    expect(bands[0].height).toBe(364 + 140 + 24);
  });

  it('a drop becoming the topmost card shifts the band by at most one inset', () => {
    const settled = laneContainerLayout({
      nodes: [{ id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    const dropped = laneContainerLayout({
      nodes: [{ id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'a0', lane: 'role:a', laneY: 5, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    expect(dropped.laneY.get('a1')).toBeGreaterThanOrEqual(24);
    expect(dropped.laneY.get('a1') - settled.laneY.get('a1')).toBeLessThanOrEqual(24);
  });

  it('a strayed member (negative offset) stays out of the hug and keeps its place', () => {
    const { bands, laneY, positions } = laneContainerLayout({
      nodes: [{ id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
        { id: 'stray', lane: 'unassigned', laneY: -800, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    expect(laneY.has('stray')).toBe(false);
    expect(positions.has('stray')).toBe(false);
    expect(bands[2].height).toBe(150);
  });

  it('unknown membership and missing offsets contribute nothing', () => {
    const { bands, positions } = laneContainerLayout({
      nodes: [
        { id: 'ghost', lane: 'role:gone', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode' },
        { id: 'nooffset', lane: 'role:a', position: { x: 0, y: 0 }, type: 'processNode' }
      ],
      bandIds: BANDS, membershipOf, laneYOf
    });
    expect(bands[0].height).toBe(150);
    expect(positions.size).toBe(0);
  });

  it('keeps empty bands at the minimum height as drop targets', () => {
    const { bands } = laneContainerLayout({
      nodes: [{ id: 'b1', lane: 'role:b', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }],
      bandIds: BANDS, membershipOf, laneYOf
    });
    expect(bands[0].height).toBe(150);
    expect(bands[2].height).toBe(150);
  });

  it('is idempotent over its own output', () => {
    const nodes = [{ id: 'a1', lane: 'role:a', laneY: 24, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } },
      { id: 'b1', lane: 'role:b', laneY: 300, position: { x: 0, y: 0 }, type: 'processNode', dimensions: { height: 140 } }];
    const first = laneContainerLayout({ nodes, bandIds: BANDS, membershipOf, laneYOf });
    const seated = nodes.map(node => ({ ...node, laneY: first.laneY.get(node.id), position: { x: 0, y: first.positions.get(node.id) } }));
    const second = laneContainerLayout({ nodes: seated, bandIds: BANDS, membershipOf, laneYOf });
    expect([...second.laneY.entries()]).toEqual([...first.laneY.entries()]);
    expect([...second.positions.entries()]).toEqual([...first.positions.entries()]);
    expect(second.bands).toEqual(first.bands);
  });
});

describe('deriveLaneFacts', () => {
  const BANDS = ['role:a', 'role:b', 'unassigned'];

  it('derives membership and offsets by containment against the seed stack', () => {
    const [derived] = deriveLaneFacts({
      nodes: [{ id: 'n1', type: 'processNode', position: { x: 0, y: 170 }, data: {} }],
      bandIds: BANDS
    });
    expect(derived.data.lane).toBe('role:b'); // seed stack: a [0,150), b [150,300)
    expect(derived.data.laneY).toBe(20);
  });

  it('membership-known nodes take the offset against their own band', () => {
    const [derived] = deriveLaneFacts({
      nodes: [{ id: 'n1', type: 'processNode', position: { x: 0, y: 170 }, data: {} }],
      bandIds: BANDS,
      membershipOf: () => 'unassigned'
    });
    expect(derived.data.lane).toBeUndefined();
    // above its own band: clamped into it — authored offsets are never
    // negative, the node seats at its band's top
    expect(derived.data.laneY).toBe(0);
  });

  it('leaves nodes above the stack and below it correctly', () => {
    const derived = deriveLaneFacts({
      nodes: [
        { id: 'above', type: 'processNode', position: { x: 0, y: -300 }, data: {} },
        { id: 'below', type: 'processNode', position: { x: 0, y: 5000 }, data: {} }
      ],
      bandIds: BANDS
    });
    expect(derived[0].data.lane).toBeUndefined();
    expect(derived[0].data.laneY).toBeUndefined();
    expect(derived[1].data.lane).toBe('unassigned');
  });

  it('never rewrites nodes that already carry facts', () => {
    const node = { id: 'n1', type: 'processNode', position: { x: 0, y: 320 }, data: { laneY: 42 } };
    const [derived] = deriveLaneFacts({ nodes: [node], bandIds: BANDS });
    expect(derived).toBe(node);
  });
});
