import { describe, expect, it } from 'vitest';
import {
  AUTHORING_DOCUMENT_FORMAT,
  AUTHORING_DOCUMENT_VERSION,
  normalizeAuthoringDocument,
  validateAuthoringDocument
} from './authoring-schema.js';
import { GRAPH_INPUT_OPERATION } from './graph.js';

const validDocument = () => ({
  format: AUTHORING_DOCUMENT_FORMAT,
  version: AUTHORING_DOCUMENT_VERSION,
  id: 'graph.document',
  revision: 'rev-01',
  interface: {
    inputs: [{ id: 'source', contract: { shape: 'item', semantic: { base: 'entityRef' } }, default: { kind: 'draft' } }],
    outputs: [{ id: 'document', contract: { shape: 'item', semantic: { base: 'document' } }, label: 'Document' }]
  },
  nodes: [
    {
      id: 'format-1',
      operation: { provider: 'plugin.documents', id: 'document.compose', version: '3' },
      config: { template: 'brief' },
      capabilities: ['documents:read'],
      effects: ['read']
    },
    { id: 'sub', invoke: { graphId: 'graph.child', revision: 'rev-2' } }
  ],
  edges: [
    { source: { node: 'source', port: 'value' }, target: { node: 'format-1', port: 'source' } },
    { id: 'named-edge', kind: 'control', source: { node: 'format-1', port: 'document' }, target: { node: 'sub', port: 'source' } }
  ],
  presentation: { positions: { 'format-1': { x: 20, y: 40 } } }
});

describe('authoring document schema', () => {
  it('normalizes defaults, synthesizes edge ids, and freezes the document', () => {
    const document = normalizeAuthoringDocument(validDocument());
    expect(document.format).toBe(AUTHORING_DOCUMENT_FORMAT);
    expect(document.interface.inputs[0].required).toBe(true);
    expect(document.nodes[1].capabilities).toEqual([]);
    expect(document.edges[0].id).toBe('edge-1');
    expect(document.edges[1].id).toBe('named-edge');
    expect(document.edges[1].kind).toBe('control');
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.nodes[0])).toBe(true);
    expect(Object.isFrozen(document.nodes[0].operation)).toBe(true);
  });

  it('accepts a valid document without defaults', () => {
    const raw = validDocument();
    delete raw.format;
    delete raw.version;
    expect(validateAuthoringDocument(raw)).toEqual([]);
  });

  it('does not mutate authored input', () => {
    const raw = validDocument();
    const before = JSON.stringify(raw);
    normalizeAuthoringDocument(raw);
    validateAuthoringDocument(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('rejects unknown keys at every level with document paths', () => {
    const raw = validDocument();
    raw.foo = 1;
    raw.nodes[0].extra = true;
    raw.interface.inputs[0].typo = 'x';
    raw.interface.inputs[0].contract.kind = 'y';
    raw.edges[0].meta = 'z';
    raw.edges[0].source.label = 'w';
    const paths = validateAuthoringDocument(raw).map(problem => problem.path);
    expect(paths).toEqual(['foo', 'interface.inputs[0].typo', 'interface.inputs[0].contract.kind', 'nodes[0].extra', 'edges[0].meta', 'edges[0].source.label']);
    for (const problem of validateAuthoringDocument(raw)) expect(problem.code).toBe('unknown-key');
  });

  it('rejects structural malformations as invalid-document', () => {
    expect(validateAuthoringDocument(null)[0].code).toBe('invalid-document');
    const both = validDocument();
    both.nodes[1].operation = { provider: 'p', id: 'o', version: '1' };
    expect(validateAuthoringDocument(both)[0].code).toBe('invalid-document');
    const neither = validDocument();
    delete neither.nodes[1].invoke;
    expect(validateAuthoringDocument(neither)[0].code).toBe('invalid-document');
    const badConfig = validDocument();
    badConfig.nodes[0].config = { run() {} };
    expect(validateAuthoringDocument(badConfig)[0].code).toBe('invalid-document');
    const badCapabilities = validDocument();
    badCapabilities.nodes[0].capabilities = [42];
    expect(validateAuthoringDocument(badCapabilities)[0].code).toBe('invalid-document');
    const badPresentation = validDocument();
    badPresentation.presentation = [1, 2];
    expect(validateAuthoringDocument(badPresentation)[0].code).toBe('invalid-document');
  });

  it('rejects unsupported formats and versions', () => {
    const raw = validDocument();
    raw.format = 'other.authoring';
    raw.version = 99;
    const codes = validateAuthoringDocument(raw).map(problem => problem.code);
    expect(codes).toEqual(expect.arrayContaining(['unsupported-format', 'unsupported-version']));
  });

  it('rejects unstable ids and duplicate identities', () => {
    const raw = validDocument();
    raw.id = 'not allowed!';
    expect(validateAuthoringDocument(raw).map(problem => problem.code)).toContain('invalid-id');

    const duplicateNode = validDocument();
    duplicateNode.nodes.push({ ...duplicateNode.nodes[0] });
    expect(validateAuthoringDocument(duplicateNode).map(problem => problem.code)).toContain('duplicate-node-id');

    const duplicatePort = validDocument();
    duplicatePort.interface.inputs.push({ ...duplicatePort.interface.inputs[0] });
    expect(validateAuthoringDocument(duplicatePort).map(problem => problem.code)).toContain('duplicate-interface-id');

    const duplicateEdge = validDocument();
    duplicateEdge.edges.push({ ...duplicateEdge.edges[1] });
    expect(validateAuthoringDocument(duplicateEdge).map(problem => problem.code)).toContain('duplicate-edge-id');
  });

  it('rejects interface ports colliding across directions or with node ids', () => {
    const crossDirection = validDocument();
    crossDirection.interface.outputs.push({ id: 'source', contract: { shape: 'item', semantic: { base: 'x' } } });
    expect(validateAuthoringDocument(crossDirection).map(problem => problem.code)).toContain('interface-id-collision');

    const nodeCollision = validDocument();
    nodeCollision.nodes.push({ id: 'source', operation: { provider: 'p', id: 'o', version: '1' } });
    const problems = validateAuthoringDocument(nodeCollision);
    expect(problems.map(problem => problem.code)).toContain('boundary-id-collision');
    expect(problems.find(problem => problem.code === 'boundary-id-collision').path).toBe('nodes[2].id');
  });

  it('rejects synthesized core boundary and invocation operations on authored nodes', () => {
    const raw = validDocument();
    raw.nodes[0].operation = { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' };
    expect(validateAuthoringDocument(raw).map(problem => problem.code)).toContain('reserved-operation');
  });

  it('rejects edges referencing missing nodes', () => {
    const raw = validDocument();
    raw.edges[0].target.node = 'missing';
    expect(validateAuthoringDocument(raw).map(problem => problem.code)).toContain('missing-edge-node');
  });

  it('rejects a synthesized edge id colliding with an authored one', () => {
    const raw = validDocument();
    raw.edges[1].id = 'edge-1';
    expect(validateAuthoringDocument(raw).map(problem => problem.code)).toContain('duplicate-edge-id');
  });

  it('resolves edge endpoints against nodes and interface ports', () => {
    const raw = validDocument();
    raw.edges[0].target.node = 'document';
    expect(validateAuthoringDocument(raw)).toEqual([]);
  });
});
