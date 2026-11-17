import { describe, expect, it } from 'vitest';
import { useGraphDocumentSession } from './useGraphDocumentSession.js';
import { createRuntime as createDocumentsRuntime } from '../workers/documents/runtime/shared.mjs';

function createSession() {
  return useGraphDocumentSession({ t: key => key });
}

describe('useGraphDocumentSession', () => {
  it('creates and round-trips canonical graph documents with boundary nodes', () => {
    const session = createSession();
    const [input, output] = session.paletteGroups.value[0].items;
    session.addNode(input, { x: 0, y: 0 });
    session.addNode(output, { x: 240, y: 0 });

    const graph = session.serializeGraph();

    expect(graph.format).toBe('perigram.graph');
    expect(graph.interface.inputs).toHaveLength(1);
    expect(graph.interface.outputs).toHaveLength(1);
    expect(graph.nodes.map(node => node.operation.id)).toEqual([
      'perigram.core.graph-input',
      'perigram.core.graph-output'
    ]);
    expect(session.validation.value.ok).toBe(true);
    expect(session.loadDocument(graph).id).toBe(graph.id);
    expect(session.serializeGraph()).toEqual(graph);
  });

  it('executes the core CTS query node through the injected authorized data capability', async () => {
    const calls = [];
    const session = useGraphDocumentSession({
      t: key => key,
      queryOrganizationData: async query => {
        calls.push(query);
        return {
          items: [{ _id: 'part-1', type: 'part', fields: { code: 'A' } }],
          count: 1,
          readSet: {
            consistency: 'sequence-bracketed',
            organizationSequenceStart: 8,
            organizationSequenceEnd: 8,
            instances: [{ typeId: 'part', instanceId: 'part-1', updatedAt: '2026-11-16T10:00:00Z', typeVersion: 2 }],
            relations: [],
            queries: [{ typeId: 'part', query: { limit: 50 }, resultIds: ['part-1'], observedTotal: 1, sequence: 8 }]
          }
        };
      }
    });
    const queryItem = session.paletteGroups.value
      .flatMap(group => group.items)
      .find(item => item.operation?.id === 'query.instances');
    expect(queryItem).toBeTruthy();
    const node = session.addNode(queryItem, { x: 0, y: 0 });
    session.updateNodeConfig(node.id, { typeId: 'part', limit: 50 });
    const result = await session.refreshPreview();

    expect(calls).toEqual([{ typeId: 'part', limit: 50, filters: {} }]);
    expect(result.nodeOutputs[node.id]).toEqual({
      items: [{ _id: 'part-1', type: 'part', fields: { code: 'A' } }],
      count: 1
    });
    expect(session.executionRecord.value.readSet).toMatchObject({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 8,
      organizationSequenceEnd: 8,
      instances: [{ typeId: 'part', instanceId: 'part-1', typeVersion: 2 }],
      queries: [{ typeId: 'part', resultIds: ['part-1'], sequence: 8 }]
    });
  });

  it('composes an independently registered plugin provider into the palette and preview runtime', async () => {
    const definition = {
      provider: 'plugin.example',
      id: 'math.double',
      version: '1',
      label: 'Double',
      palette: { group: 'numeric-operations', label: 'Numeric operations', keywords: ['arithmetic', 'math'] },
      inputs: [{ id: 'value', shape: 'item', semantic: { base: 'number' }, required: true }],
      outputs: [{ id: 'result', shape: 'item', semantic: { base: 'number' }, required: true }],
      execution: { kind: 'pure', deterministic: true }
    };
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        provider: 'plugin.example',
        definitions: [definition],
        execute: (_definition, { inputs }) => ({ result: inputs.value * 2 })
      }]
    });
    const pluginGroup = session.paletteGroups.value.find(group => group.source === 'plugin');
    expect(pluginGroup).toMatchObject({ id: 'graph-plugin.example-numeric-operations', label: 'Numeric operations' });
    expect(pluginGroup.items[0]).toMatchObject({ keywords: ['arithmetic', 'math'], searchTerms: ['plugin.example', 'math.double', 'numeric-operations'] });
    expect(pluginGroup.items[0].operation).toEqual({
      provider: 'plugin.example', id: 'math.double', version: '1'
    });
    const input = session.addNode(session.paletteGroups.value[0].items[0], { x: 0, y: 0 });
    const node = session.addNode(pluginGroup.items[0], { x: 200, y: 0 });
    const output = session.addNode(session.paletteGroups.value[0].items[1], { x: 400, y: 0 });
    session.onConnect({ source: input.id, sourceHandle: 'value', target: node.id, targetHandle: 'value' });
    session.onConnect({ source: node.id, sourceHandle: 'result', target: output.id, targetHandle: 'value' });
    const inputId = session.graphDocument.value.interface.inputs[0].id;
    session.setGraphInputBinding({ portId: inputId, value: 9 });
    const result = await session.refreshPreview();
    expect(result.outputs).toEqual({ [session.graphDocument.value.interface.outputs[0].id]: 18 });
    expect(session.executionRecord.value).toMatchObject({ profile: 'procedural-preview', status: 'succeeded', graph: { id: session.graphDocument.value.id } });
    expect(session.executionRecord.value.provenance.nodes.some(item => item.operation?.provider === 'plugin.example')).toBe(true);
  });

  it('composes and exports a Documents flow through listing-derived unified graph nodes', async () => {
    const runtime = createDocumentsRuntime();
    const contribution = runtime.providers[0];
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        ...contribution,
        execute: (definition, invocation) => runtime.execute(definition.id, invocation)
      }]
    });
    const core = session.paletteGroups.value[0].items;
    const input = session.addNode(core[0], { x: 0, y: 0 });
    const outputDocument = session.addNode(core[1], { x: 900, y: 0 });
    const inputPort = session.graphDocument.value.interface.inputs[0].id;
    const outputDocumentPort = session.graphDocument.value.interface.outputs[0].id;
    session.updateBoundaryDeclaration(input.id, {
      contract: { shape: 'item', semantic: { base: 'string' } },
      required: true
    });
    session.updateBoundaryDeclaration(outputDocument.id, {
      contract: { shape: 'item', semantic: { base: 'json', kind: 'text.flow-document' } },
      required: true
    });

    const items = session.paletteGroups.value.flatMap(group => group.items);
    const paragraph = session.addNode(items.find(item => item.operation?.id === 'document-paragraph'), { x: 220, y: 0 });
    const compose = session.addNode(items.find(item => item.operation?.id === 'compose-document'), { x: 460, y: 0 });
    const exportFile = session.addNode(items.find(item => item.operation?.id === 'export-markdown-file'), { x: 680, y: 220 });
    const outputFile = session.addNode(core[1], { x: 900, y: 220 });
    session.updateBoundaryDeclaration(outputFile.id, {
      contract: { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } },
      required: true
    });

    session.onConnect({ source: input.id, sourceHandle: 'value', target: paragraph.id, targetHandle: 'text' });
    session.onConnect({ source: paragraph.id, sourceHandle: 'value', target: compose.id, targetHandle: 'blocks' });
    session.onConnect({ source: compose.id, sourceHandle: 'value', target: outputDocument.id, targetHandle: 'value' });
    session.onConnect({ source: compose.id, sourceHandle: 'value', target: exportFile.id, targetHandle: 'document' });
    session.onConnect({ source: exportFile.id, sourceHandle: 'value', target: outputFile.id, targetHandle: 'value' });
    session.setGraphInputBinding({ portId: inputPort, value: 'Documents graph is live' });

    expect(session.edges.value).toHaveLength(5);
    const result = await session.refreshPreview();
    expect(result.outputs[outputDocumentPort]).toMatchObject({
      type: 'text.flow-document',
      blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Documents graph is live' }] }]
    });
    const file = result.outputs[session.graphDocument.value.interface.outputs.find(port => port.id !== outputDocumentPort).id];
    expect(file.payload.mime).toBe('text/markdown');
    expect(Buffer.from(file.payload.base64, 'base64').toString()).toContain('Documents graph is live');
    expect(session.previewError.value).toBe('');
  });

  it('uses one execution identity and finalizes plugin runtimes after a preview', async () => {
    const finalized = [];
    const session = useGraphDocumentSession({
      t: key => key,
      finalizeExecution: async id => { finalized.push(id); }
    });
    const [input, output] = session.paletteGroups.value[0].items;
    const inputNode = session.addNode(input, { x: 0, y: 0 });
    const outputNode = session.addNode(output, { x: 240, y: 0 });
    session.onConnect({
      source: inputNode.id,
      sourceHandle: 'value',
      target: outputNode.id,
      targetHandle: 'value'
    });
    await session.refreshPreview();
    expect(finalized).toEqual([session.executionRecord.value.id]);
  });

  it('finalizes plugin runtimes after a failed graph preview too', async () => {
    const finalized = [];
    const session = useGraphDocumentSession({
      t: key => key,
      finalizeExecution: async id => { finalized.push(id); },
      providers: [{
        provider: 'plugin.example',
        definitions: [{
          provider: 'plugin.example', id: 'fail', version: '1',
          palette: { group: 'diagnostics', label: 'Diagnostics' },
          inputs: [{ id: 'value', semantic: { base: 'number' }, required: true }],
          outputs: [{ id: 'result', semantic: { base: 'number' }, required: true }],
          execution: { kind: 'pure' }
        }],
        execute: async () => { throw new Error('preview failed'); }
      }]
    });
    const [input, output] = session.paletteGroups.value[0].items;
    const inputNode = session.addNode(input, { x: 0, y: 0 });
    const item = session.paletteGroups.value.flatMap(group => group.items).find(entry => entry.operation?.id === 'fail');
    const node = session.addNode(item, { x: 120, y: 0 });
    const outputNode = session.addNode(output, { x: 360, y: 0 });
    session.onConnect({ source: inputNode.id, sourceHandle: 'value', target: node.id, targetHandle: 'value' });
    session.onConnect({ source: node.id, sourceHandle: 'result', target: outputNode.id, targetHandle: 'value' });
    session.setGraphInputBinding({ portId: session.graphDocument.value.interface.inputs[0].id, value: 4 });
    await session.refreshPreview();
    expect(finalized).toEqual([session.executionRecord.value.id]);
    expect(session.executionRecord.value.status).toBe('failed');
    expect(session.previewError.value).toContain('preview failed');
    expect(node).toBeTruthy();
  });

  it('places saved graph revisions directly from the Use Graph palette', () => {
    const source = createSession();
    const [input, output] = source.paletteGroups.value[0].items;
    source.addNode(input, { x: 0, y: 0 });
    source.addNode(output, { x: 240, y: 0 });
    const savedGraph = source.serializeGraph();

    const caller = useGraphDocumentSession({
      t: key => key,
      graphDocuments: [{ graph: savedGraph }]
    });
    const group = caller.paletteGroups.value.find(item => item.source === 'graphs');
    expect(group.items).toHaveLength(1);
    expect(group.items[0]).toMatchObject({
      label: savedGraph.name || savedGraph.id,
      operation: { id: 'perigram.core.use-graph' },
      config: { graphId: savedGraph.id, revision: savedGraph.revision }
    });

    const node = caller.addNode(group.items[0], { x: 120, y: 80 });
    expect(node.data.config).toMatchObject({
      graphId: savedGraph.id,
      revision: savedGraph.revision,
      interface: {
        inputs: savedGraph.interface.inputs,
        outputs: savedGraph.interface.outputs
      }
    });
    expect(node.data.definition.inputs.map(port => port.id)).toEqual(savedGraph.interface.inputs.map(port => port.id));
    expect(node.data.definition.outputs.map(port => port.id)).toEqual(savedGraph.interface.outputs.map(port => port.id));
  });

  it('registers an installed plugin provider dynamically and enforces provider ownership', () => {
    const session = createSession();
    const contribution = {
      provider: 'plugin.example',
      definitions: [{
        provider: 'plugin.example', id: 'value.constant', version: '1',
        palette: { group: 'values', label: 'Values' },
        inputs: [], outputs: [{ id: 'value', semantic: { base: 'number' } }],
        execution: { kind: 'pure' }
      }],
      execute: async () => ({ value: 7 })
    };
    session.registerNodeProvider(contribution, 'example');
    expect(session.paletteGroups.value.some(group => group.items.some(item => item.operation?.id === 'value.constant'))).toBe(true);
    const foreign = {
      ...contribution,
      provider: 'plugin.other',
      definitions: contribution.definitions.map(definition => ({ ...definition, provider: 'plugin.other' }))
    };
    expect(() => session.registerNodeProvider(foreign, 'example')).toThrow(/not owned by installed plugin example/);
  });

  it('previews Graph Input to Graph Output with explicit JSON bindings', async () => {
    const session = createSession();
    const [input, output] = session.paletteGroups.value[0].items;
    const inputNode = session.addNode(input, { x: 0, y: 0 });
    const outputNode = session.addNode(output, { x: 240, y: 0 });

    session.onConnect({
      source: inputNode.id,
      sourceHandle: 'value',
      target: outputNode.id,
      targetHandle: 'value'
    });
    const inputId = session.graphDocument.value.interface.inputs[0].id;
    session.setGraphInputBinding({ portId: inputId, value: { message: 'hello' } });

    const result = await session.refreshPreview();

    expect(result.outputs).toEqual({
      [session.graphDocument.value.interface.outputs[0].id]: { message: 'hello' }
    });
    expect(session.previewError.value).toBe('');
  });

  it('edits boundary semantic contracts and optional defaults as interface declarations', () => {
    const session = createSession();
    const [input] = session.paletteGroups.value[0].items;
    const node = session.addNode(input, { x: 0, y: 0 });
    const portId = session.graphDocument.value.interface.inputs[0].id;

    session.updateBoundaryDeclaration(node.id, {
      contract: { shape: 'list', semantic: { base: 'number', unit: 'kg' } },
      required: true,
      default: [1, 2]
    });

    expect(session.graphDocument.value.interface.inputs[0]).toMatchObject({
      id: portId,
      contract: { shape: 'list', semantic: { base: 'number', unit: 'kg' } },
      required: true,
      default: [1, 2]
    });
    expect(session.serializeGraph().interface.inputs[0].default).toEqual([1, 2]);

    session.updateBoundaryDeclaration(node.id, {
      contract: { shape: 'item', semantic: { base: 'json' } },
      required: false
    });
    expect(session.graphDocument.value.interface.inputs[0]).not.toHaveProperty('default');
    expect(session.validation.value.ok).toBe(true);
  });

  it('rejects malformed boundary declarations without mutating the interface', () => {
    const session = createSession();
    const [input] = session.paletteGroups.value[0].items;
    const node = session.addNode(input, { x: 0, y: 0 });
    const before = JSON.parse(JSON.stringify(session.graphDocument.value.interface.inputs[0]));

    expect(() => session.updateBoundaryDeclaration(node.id, {
      contract: { shape: 'unknown', semantic: {} },
      required: true
    })).toThrow(/supported shape/);
    expect(session.graphDocument.value.interface.inputs[0]).toEqual(before);
  });

  it('hydrates a Use Graph node from an exact pinned graph revision', () => {
    const session = createSession();
    const invocation = session.paletteGroups.value.find(group => group.id === 'graph-invocation').items[0];
    const node = session.addNode(invocation, { x: 0, y: 0 });
    const child = createSession();
    const [input, output] = child.paletteGroups.value[0].items;
    child.addNode(input, { x: 0, y: 0 });
    child.addNode(output, { x: 200, y: 0 });
    child.updateBoundaryDeclaration(child.nodes.value[0].id, {
      contract: { shape: 'list', semantic: { base: 'number' } },
      required: true,
      default: [3, 4]
    });
    const pinned = child.serializeGraph();

    const config = session.hydrateGraphInvocation(node.id, pinned);

    expect(config).toMatchObject({
      graphId: pinned.id,
      revision: pinned.revision,
      interface: {
        inputs: [{
          id: pinned.interface.inputs[0].id,
          contract: { shape: 'list', semantic: { base: 'number' } },
          default: [3, 4]
        }],
        outputs: [{ id: pinned.interface.outputs[0].id }]
      }
    });
    expect(session.nodes.value[0].data.definition.inputs[0].shape).toBe('list');
    expect(session.serializeGraph().nodes[0].config.revision).toBe(pinned.revision);
  });
});
