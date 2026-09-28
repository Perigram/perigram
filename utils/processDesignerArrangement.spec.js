// Layered-arrangement contract (canonical home:
// components/process-designer/README.md "Auto-arrangement"): the pure
// Tidy pass — deterministic, idempotent, lane-preserving, flow-directed.
import { describe, expect, it } from 'vitest';
import { arrangeProcessGraph } from '~/utils/processDesignerArrangement.js';

const BAND_A = { id: 'role:a', kind: 'role', label: 'A', top: 0, height: 340 };
const BAND_B = { id: 'role:b', kind: 'role', label: 'B', top: 340, height: 340 };

function processNode(id, x, y) {
  return { id, type: 'processNode', position: { x, y } };
}

function declarationNode(id, type, x, y) {
  return { id, type, position: { x, y } };
}

function arrange({ nodes, edges, effects, bands = [BAND_A, BAND_B], bandOfNodeId }) {
  return arrangeProcessGraph({
    nodes,
    edges,
    effectIds: new Set(effects),
    bands,
    bandOfNodeId
  });
}

describe('arrangeProcessGraph', () => {
  it('returns nothing for an empty graph', () => {
    expect(arrange({ nodes: [], edges: [], effects: [], bandOfNodeId: new Map() }).size).toBe(0);
  });

  it('returns nothing when no node is an effect (declaration-only graph)', () => {
    const nodes = [declarationNode('cls', 'ctsClass', 10, 20), declarationNode('fld', 'ctsField', 30, 40)];
    const result = arrange({
      nodes,
      edges: [{ source: 'fld', target: 'cls', role: 'type' }],
      effects: [],
      bandOfNodeId: new Map()
    });
    expect(result.size).toBe(0);
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

  it('places every effect inside its lane band on a distinct row', () => {
    const nodes = [
      processNode('a1', 900, 0), processNode('a2', 500, 0), processNode('a3', 100, 0)
    ];
    const band = { id: 'role:a', kind: 'role', label: 'A', top: 0, height: 510 };
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
    const rows = ['a1', 'a2', 'a3'].map(id => result.get(id).y);
    for (const y of rows) {
      expect(y).toBeGreaterThanOrEqual(band.top);
      expect(y).toBeLessThan(band.top + band.height);
    }
    expect(new Set(rows).size).toBe(3);
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
    expect(signA).toBe(signB);
    expect(signA).not.toBe(0);
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

  it('places a fan-out secondary at the median between its consumers', () => {
    const nodes = [processNode('src', 0, 0), processNode('eA', 0, 0), processNode('eB', 0, 0)];
    const result = arrange({
      nodes,
      edges: [
        { source: 'src', target: 'eA' },
        { source: 'src', target: 'eB' }
      ],
      effects: ['eA', 'eB'],
      bandOfNodeId: new Map([['eA', BAND_A], ['eB', BAND_B]])
    });
    const y = result.get('src').y;
    const top = result.get('eA').y;
    const bottom = result.get('eB').y;
    expect(y).toBeGreaterThan(top);
    expect(y).toBeLessThan(bottom);
    expect(y - top).toBeLessThan(bottom - top);
    expect(bottom - y).toBeLessThan(bottom - top);
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

  it('keeps a downstream-less secondary node at its authored y', () => {
    const result = arrange({
      nodes: [processNode('island', 12, 345), processNode('eff', 0, 0)],
      edges: [],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    expect(result.get('island').y).toBe(345);
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

  it('keeps a declaration island bound to no process node untouched', () => {
    const nodes = [
      declarationNode('isoCls', 'ctsClass', 41, 42),
      declarationNode('isoFld', 'ctsField', 43, 44),
      processNode('eff', 0, 0)
    ];
    const result = arrange({
      nodes,
      edges: [
        { source: 'isoFld', target: 'isoCls', role: 'type' }
      ],
      effects: ['eff'],
      bandOfNodeId: new Map([['eff', BAND_A]])
    });
    expect(result.has('isoCls')).toBe(false);
    expect(result.has('isoFld')).toBe(false);
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
    const first = arrange(input);
    expect(arrange(input)).toEqual(first);
    const second = arrange({
      ...input,
      nodes: input.nodes.map(node => (
        first.has(node.id) ? { ...node, position: first.get(node.id) } : node
      ))
    });
    expect([...second]).toEqual([...first]);
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
});
