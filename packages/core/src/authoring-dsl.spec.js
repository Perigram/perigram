import { describe, expect, it } from 'vitest';
import {
  AUTHORING_SOURCE_MAP_FORMAT,
  AUTHORING_SOURCE_MAP_VERSION,
  parseAuthoringDsl,
  serializeAuthoringDsl,
  lowerAuthoringDocument
} from './authoring-dsl.js';
import { normalizeAuthoringDocument } from './authoring-schema.js';
import {
  CORE_GRAPH_PROVIDER,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  normalizeGraphDocument
} from './graph.js';

const minimalSource = `(:graph "graph.echo" "rev-1"
  (:interface
    (:input "text" :item {:base "text"})
    (:output "result" :item {:base "text"}))
  (:node "upper" :plugin.text/uppercase "2")
  (:connect :text/value :upper/source)
  (:connect :upper/text :result/value))`;

const fullSource = `; Composed document graph
(:graph "graph.document" "rev-01"
  (:name "Document graph")
  (:description "Compose a document from a source record")
  (:interface
    (:input "source" :item {:base "entityRef"}
      {:label "Source record" :required false :default {:kind "draft"}})
    (:output "document" :item {:base "document"}))
  (:node "format-1" :plugin.documents/document.compose "3"
    {:template "brief" :mode :fast :times 2 :nested {:deep [1 "two" true nil]}}
    {:capabilities ["documents:read"] :effects ["read"]})
  (:invoke "sub" "graph.child" "rev-2" {:effects ["call"]})
  (:connect :source/value :format-1/source)
  (:connect "edge-2" :format-1/document :sub/source {:kind :control})
  (:connect :sub/document :document/value)
  (:presentation {:positions {:format-1 {:x 20 :y 40}}}))`;

const declaredSource = `(:graph "graph.relay" "rev-9"
  (:interface (:input "in" :map {:base "json"}))
  (:node "relay" :worker.mesh/relay "7" {} {:capabilities ["mesh:write" "mesh:read"]})
  (:connect :in/value :relay/payload))`;

const fixtures = { minimalSource, fullSource, declaredSource };

const handBuiltCanonical = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: 1,
  id: 'graph.document',
  revision: 'rev-01',
  name: 'Document graph',
  description: 'Compose a document from a source record',
  interface: {
    inputs: [{
      id: 'source',
      label: 'Source record',
      contract: { shape: 'item', semantic: { base: 'entityRef' } },
      required: false,
      default: { kind: 'draft' }
    }],
    outputs: [{ id: 'document', label: 'document', contract: { shape: 'item', semantic: { base: 'document' } }, required: true }]
  },
  nodes: [
    { id: 'source', operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'source' } },
    { id: 'document', operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'document' } },
    {
      id: 'format-1',
      operation: { provider: 'plugin.documents', id: 'document.compose', version: '3' },
      config: { template: 'brief', mode: 'fast', times: 2, nested: { deep: [1, 'two', true, null] } }
    },
    { id: 'sub', operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_INVOKE_OPERATION, version: '1' }, config: { graphId: 'graph.child', revision: 'rev-2' } }
  ],
  edges: [
    { id: 'edge-1', source: { node: 'source', port: 'value' }, target: { node: 'format-1', port: 'source' } },
    { id: 'edge-2', kind: 'control', source: { node: 'format-1', port: 'document' }, target: { node: 'sub', port: 'source' } },
    { id: 'edge-3', source: { node: 'sub', port: 'document' }, target: { node: 'document', port: 'value' } }
  ],
  metadata: {
    presentation: { positions: { 'format-1': { x: 20, y: 40 } } },
    authoring: { declarations: { 'format-1': { capabilities: ['documents:read'], effects: ['read'] }, sub: { effects: ['call'] } } }
  }
});

describe('parseAuthoringDsl', () => {
  it('parses the minimal fixture into the normalized structured document', () => {
    const { document, diagnostics } = parseAuthoringDsl(minimalSource);
    expect(diagnostics).toEqual([]);
    expect(document.id).toBe('graph.echo');
    expect(document.interface.inputs[0]).toEqual({
      id: 'text',
      contract: { shape: 'item', semantic: { base: 'text' } },
      required: true
    });
    expect(document.nodes[0]).toEqual({
      id: 'upper',
      operation: { provider: 'plugin.text', id: 'uppercase', version: '2' },
      capabilities: [],
      effects: []
    });
    expect(document.edges.map(edge => edge.id)).toEqual(['edge-1', 'edge-2']);
    expect(document.edges[0].source).toEqual({ node: 'text', port: 'value' });
  });

  it('parses the full fixture with typed values, declarations, and presentation', () => {
    const { document, diagnostics } = parseAuthoringDsl(fullSource);
    expect(diagnostics).toEqual([]);
    expect(document.nodes[0].config).toEqual({ template: 'brief', mode: 'fast', times: 2, nested: { deep: [1, 'two', true, null] } });
    expect(document.nodes[0].capabilities).toEqual(['documents:read']);
    expect(document.nodes[0].effects).toEqual(['read']);
    expect(document.nodes[1].invoke).toEqual({ graphId: 'graph.child', revision: 'rev-2' });
    expect(document.interface.inputs[0].default).toEqual({ kind: 'draft' });
    expect(document.interface.inputs[0].required).toBe(false);
    expect(document.presentation).toEqual({ positions: { 'format-1': { x: 20, y: 40 } } });
  });

  it('maps reader problems to their source forms', () => {
    const { document, diagnostics } = parseAuthoringDsl('(:graph "g" "r"\n  (node "x" :p/op "1"))');
    expect(document).toBeNull();
    expect(diagnostics[0].code).toBe('unsupported-token');
    expect(diagnostics[0].pos).toEqual({ line: 2, column: 4, span: { start: 19, end: 23 } });
  });

  it('maps unknown forms, options, and endpoints to their source positions', () => {
    const source = [
      '(:graph "g" "r"',
      '  (:frobnicate 1)',
      '  (:node "x" :p/op "1" {} {:frob true})',
      '  (:connect :value :x/in))'
    ].join('\n');
    const { diagnostics } = parseAuthoringDsl(source);
    const byCode = Object.fromEntries(diagnostics.map(item => [item.code, item]));
    expect(byCode['unknown-form'].pos).toEqual({ line: 2, column: 3, span: { start: 18, end: 33 } });
    expect(byCode['unknown-option'].pos).toMatchObject({ line: 3, column: 28 });
    expect(byCode['invalid-endpoint'].pos).toMatchObject({ line: 4 });
  });

  it('rejects malformed document roots and duplicate sections', () => {
    expect(parseAuthoringDsl('').diagnostics[0].code).toBe('missing-graph-form');
    expect(parseAuthoringDsl('(:graph "g" "r") (:extra 1)').diagnostics[0].code).toBe('multiple-toplevel-forms');
    expect(parseAuthoringDsl('"just a string"').diagnostics[0].code).toBe('graph-form');
    expect(parseAuthoringDsl('(:other "g" "r")').diagnostics[0].code).toBe('unknown-form');
    const duplicate = parseAuthoringDsl('(:graph "g" "r" (:name "a") (:name "b"))');
    expect(duplicate.diagnostics[0].code).toBe('duplicate-form');
    expect(duplicate.diagnostics[0].pos.line).toBe(1);
  });

  it('rejects shape problems with mapped diagnostics', () => {
    const cases = {
      '(:graph "g" "r" (:name))': 'form-arity',
      '(:graph "g" "r" (:interface (:input "x" :bogus {:base "y"})))': 'invalid-shape',
      '(:graph "g" "r" (:interface (:input "x" :item {})))': 'invalid-semantic',
      '(:graph "g" "r" (:node "x" :unqualified "1"))': 'invalid-operation',
      '(:graph "g" "r" (:invoke "x" "graph.child"))': 'unpinned-invocation',
      '(:graph "g" "r" (:connect :a/b))': 'form-arity',
      '(:graph "g" "r" (:presentation :kw))': 'form-shape',
      '(:graph "g" "r" {:k 1})': 'form-shape'
    };
    for (const [source, code] of Object.entries(cases)) {
      expect(parseAuthoringDsl(source).diagnostics.map(item => item.code)).toContain(code);
    }
  });

  it('rejects duplicate map keys with the key position', () => {
    const { diagnostics } = parseAuthoringDsl('(:graph "g" "r" (:node "x" :p/op "1" {:a 1 :a 2}))');
    expect(diagnostics.map(item => item.code)).toContain('duplicate-map-key');
  });

  it('carries schema problems with document paths', () => {
    const source = '(:graph "g" "r"\n  (:node "x" :p/op "1")\n  (:node "x" :p/op "2"))';
    const { diagnostics } = parseAuthoringDsl(source);
    expect(diagnostics.map(item => item.code)).toContain('duplicate-node-id');
    expect(diagnostics.find(item => item.code === 'duplicate-node-id').path).toBe('nodes[1].id');
  });

  it('builds a source map covering authored nodes, boundary ports, and edges', () => {
    const { sourceMap } = parseAuthoringDsl(fullSource);
    expect(sourceMap.format).toBe(AUTHORING_SOURCE_MAP_FORMAT);
    expect(sourceMap.version).toBe(AUTHORING_SOURCE_MAP_VERSION);
    expect(sourceMap.graph).toEqual({ id: 'graph.document', revision: 'rev-01' });
    expect(Object.keys(sourceMap.nodes).sort()).toEqual(['document', 'format-1', 'source', 'sub']);
    expect(Object.keys(sourceMap.edges)).toEqual(['edge-1', 'edge-2', 'edge-3']);
    expect(sourceMap.nodes.source).toMatchObject({ line: 6, column: 5 });
    expect(sourceMap.nodes.source.span.start).toBe(fullSource.indexOf('(:input'));
    expect(sourceMap.nodes.source.span.end).toBeGreaterThan(sourceMap.nodes.source.span.start);
    expect(sourceMap.nodes['format-1']).toMatchObject({ line: 9, column: 3 });
    expect(sourceMap.nodes['format-1'].span.start).toBe(fullSource.indexOf('(:node'));
    expect(sourceMap.nodes.sub.span.start).toBe(fullSource.indexOf('(:invoke'));
    expect(sourceMap.edges['edge-2']).toMatchObject({ line: 14, column: 3 });
    expect(sourceMap.edges['edge-2'].span.start).toBe(fullSource.indexOf('(:connect "edge-2"'));
  });
});

describe('lowerAuthoringDocument', () => {
  it('lowers the full fixture to the hand-built canonical document', () => {
    const { document, sourceMap, diagnostics } = parseAuthoringDsl(fullSource);
    expect(diagnostics).toEqual([]);
    const lowered = lowerAuthoringDocument(document, sourceMap);
    expect(lowered.diagnostics).toEqual([]);
    expect(JSON.stringify(lowered.graph)).toBe(JSON.stringify(normalizeGraphDocument(handBuiltCanonical())));
  });

  it('lowers boundary and invocation nodes with pinned core operations', () => {
    const { document } = parseAuthoringDsl(fullSource);
    const { graph } = lowerAuthoringDocument(document);
    expect(graph.nodes.map(node => node.id)).toEqual(['source', 'document', 'format-1', 'sub']);
    expect(graph.nodes[0].operation).toEqual({ provider: CORE_GRAPH_PROVIDER, id: GRAPH_INPUT_OPERATION, version: '1' });
    expect(graph.nodes[1].operation).toEqual({ provider: CORE_GRAPH_PROVIDER, id: GRAPH_OUTPUT_OPERATION, version: '1' });
    expect(graph.nodes[3].operation).toEqual({ provider: CORE_GRAPH_PROVIDER, id: GRAPH_INVOKE_OPERATION, version: '1' });
    expect(graph.nodes[3].config).toEqual({ graphId: 'graph.child', revision: 'rev-2' });
  });

  it('carries capability and effect declarations through lowering', () => {
    const { document } = parseAuthoringDsl(declaredSource);
    const { graph } = lowerAuthoringDocument(document);
    expect(graph.metadata.authoring).toEqual({
      declarations: { relay: { capabilities: ['mesh:write', 'mesh:read'] } }
    });
  });

  it('passes presentation through as graph metadata', () => {
    const { document } = parseAuthoringDsl(fullSource);
    const { graph } = lowerAuthoringDocument(document);
    expect(graph.metadata.presentation).toEqual({ positions: { 'format-1': { x: 20, y: 40 } } });
  });

  it('returns diagnostics for invalid documents and stays deterministic', () => {
    const invalid = lowerAuthoringDocument({ id: 'graph.missing-revision' });
    expect(invalid.graph).toBeNull();
    expect(invalid.sourceMap).toBeNull();
    expect(invalid.diagnostics[0].code).toBe('invalid-document');

    const { document, sourceMap } = parseAuthoringDsl(fullSource);
    const first = lowerAuthoringDocument(document, sourceMap);
    const second = lowerAuthoringDocument(document, sourceMap);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first.graph)).toBe(true);
    expect(Object.isFrozen(first.sourceMap)).toBe(true);
  });

  it('filters the sidecar to lowered identities and validates spans', () => {
    const { document, sourceMap } = parseAuthoringDsl(fullSource);
    const { sourceMap: loweredMap } = lowerAuthoringDocument(document, {
      ...sourceMap,
      nodes: { ...sourceMap.nodes, stranger: { line: 1, column: 1, span: { start: 0, end: 1 } } }
    });
    expect(Object.keys(loweredMap.nodes).sort()).toEqual(['document', 'format-1', 'source', 'sub']);
    expect(loweredMap.nodes.source.span.start).toBe(fullSource.indexOf('(:input'));

    expect(() => lowerAuthoringDocument(document, { nodes: { source: { line: 1 } } })).toThrow(/sourceMap span/);

    const bare = lowerAuthoringDocument(document);
    expect(bare.sourceMap.nodes).toEqual({});
    expect(bare.sourceMap.edges).toEqual({});
    expect(bare.sourceMap.graph).toEqual({ id: 'graph.document', revision: 'rev-01' });
  });

  it('lowers machine-authored JSON through the same schema', () => {
    const { document } = parseAuthoringDsl(minimalSource);
    const raw = JSON.parse(JSON.stringify(document));
    delete raw.format;
    delete raw.version;
    const fromJson = lowerAuthoringDocument(normalizeAuthoringDocument(raw));
    const fromDsl = lowerAuthoringDocument(document);
    expect(JSON.stringify(fromJson.graph)).toBe(JSON.stringify(fromDsl.graph));
  });
});

describe('serializeAuthoringDsl round-trip law', () => {
  it('re-parses serialized fixtures to the same structured documents', () => {
    for (const source of Object.values(fixtures)) {
      const first = parseAuthoringDsl(source);
      expect(first.diagnostics).toEqual([]);
      const text = serializeAuthoringDsl(first.document);
      const second = parseAuthoringDsl(text);
      expect(second.diagnostics).toEqual([]);
      expect(JSON.stringify(second.document)).toBe(JSON.stringify(first.document));
      const loweredFirst = lowerAuthoringDocument(first.document, first.sourceMap);
      const loweredSecond = lowerAuthoringDocument(second.document, second.sourceMap);
      expect(JSON.stringify(loweredFirst.graph)).toBe(JSON.stringify(loweredSecond.graph));
    }
  });

  it('serializes deterministically and keeps declarations in the text', () => {
    const { document } = parseAuthoringDsl(fullSource);
    expect(serializeAuthoringDsl(document)).toBe(serializeAuthoringDsl(document));
    const text = serializeAuthoringDsl(document);
    expect(text).toContain(':capabilities ["documents:read"]');
    expect(text).toContain(':effects ["call"]');
    expect(text).toContain(':kind :control');
    expect(text).toContain('(:presentation {:positions {:format-1 {:x 20 :y 40}}})');
  });

  it('round-trips escaped strings and keyword-unfriendly map keys', () => {
    const source = '(:graph "g" "r"\n  (:name "Quote \\" and \\\\ newline\\n")\n  (:node "x" :p/op "1" {"odd key" 1 :safe 2}))';
    const { document, diagnostics } = parseAuthoringDsl(source);
    expect(diagnostics).toEqual([]);
    expect(document.nodes[0].config).toEqual({ 'odd key': 1, safe: 2 });
    expect(document.name).toBe('Quote " and \\ newline\n');
    const second = parseAuthoringDsl(serializeAuthoringDsl(document));
    expect(second.diagnostics).toEqual([]);
    expect(JSON.stringify(second.document)).toBe(JSON.stringify(document));
  });
});
