import { describe, expect, it } from 'vitest';
import { useGraphDocumentSession } from './useGraphDocumentSession.js';
import { processDefinitionToGraphDocument } from '@perigram/processes';
import { createRuntime as createDocumentsRuntime } from '../workers/documents/runtime/shared.mjs';

function createSession() {
  return useGraphDocumentSession({ t: key => key });
}

describe('useGraphDocumentSession', () => {
  it('executes the Documents Markdown-to-file workflow through listing-derived graph nodes', async () => {
    const documents = createDocumentsRuntime();
    const [provider] = documents.providers;
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        ...provider,
        execute: (definition, invocation) => documents.execute(definition.id, invocation)
      }]
    });
    const boundaries = session.paletteGroups.value.find(group => group.id === 'graph-boundaries');
    const input = session.addNode(boundaries.items[0], { x: 0, y: 0 });
    session.updateBoundaryDeclaration(input.id, {
      contract: { shape: 'item', semantic: { base: 'string' } },
      required: true
    });
    const output = session.addNode(boundaries.items[1], { x: 900, y: 0 });
    const operations = session.paletteGroups.value.flatMap(group => group.items);
    const parse = session.addNode(operations.find(item => item.operation?.id === 'parse-markdown'), { x: 260, y: 0 });
    const exportFile = session.addNode(operations.find(item => item.operation?.id === 'export-markdown-file'), { x: 560, y: 0 });
    session.onConnect({ source: input.id, sourceHandle: 'value', target: parse.id, targetHandle: 'text' });
    session.onConnect({ source: parse.id, sourceHandle: 'value', target: exportFile.id, targetHandle: 'document' });
    session.onConnect({ source: exportFile.id, sourceHandle: 'value', target: output.id, targetHandle: 'value' });
    session.setGraphInputBinding({
      portId: session.graphDocument.value.interface.inputs[0].id,
      value: '# Graph report\n\nBuilt from typed graph operations.'
    });

    const result = await session.refreshPreview();
    expect(result.outputs).toHaveProperty(session.graphDocument.value.interface.outputs[0].id);
    const file = result.outputs[session.graphDocument.value.interface.outputs[0].id];
    expect(file.payload).toMatchObject({ mime: 'text/markdown', name: 'document.md' });
    expect(Buffer.from(file.payload.base64, 'base64').toString('utf8'))
      .toBe('# Graph report\n\nBuilt from typed graph operations.\n');
    expect(session.executionRecord.value).toMatchObject({
      status: 'succeeded',
      provenance: { nodes: expect.arrayContaining([
        expect.objectContaining({ operation: { provider: 'plugin.documents', id: 'parse-markdown', version: '1' } }),
        expect.objectContaining({ operation: { provider: 'plugin.documents', id: 'export-markdown-file', version: '1' } })
      ]) }
    });
  });

  it('preserves Documents file-id semantics through graph boundaries and authorized file reads', async () => {
    const documents = createDocumentsRuntime();
    const [provider] = documents.providers;
    const reads = [];
    const payload = {
      fileId: 'file-docs-1',
      name: 'source.md',
      mime: 'text/markdown',
      base64: btoa('# Source document')
    };
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        ...provider,
        execute: (definition, invocation) => documents.execute(definition.id, invocation, {
          capabilities: {
            'files.read': async ({ fileId }) => {
              reads.push(fileId);
              return payload;
            }
          }
        })
      }]
    });
    const operations = session.paletteGroups.value.flatMap(group => group.items);
    const readDefinition = provider.definitions.find(definition => definition.id === 'read-file');
    const fileIdPort = readDefinition.inputs.find(port => port.id === 'fileId');
    expect(fileIdPort.semantic).toEqual({ base: 'string', kind: 'documents.file-id' });

    const boundaries = session.paletteGroups.value.find(group => group.id === 'graph-boundaries');
    const input = session.addNode(boundaries.items[0], { x: 0, y: 0 });
    session.updateBoundaryDeclaration(input.id, {
      contract: { shape: fileIdPort.shape, semantic: fileIdPort.semantic },
      required: true
    });
    const output = session.addNode(boundaries.items[1], { x: 640, y: 0 });
    session.updateBoundaryDeclaration(output.id, {
      contract: { shape: 'item', semantic: { base: 'json', kind: 'documents.file' } },
      required: true
    });
    const read = session.addNode(operations.find(item => item.operation?.id === 'read-file'), { x: 320, y: 0 });
    session.onConnect({ source: input.id, sourceHandle: 'value', target: read.id, targetHandle: 'fileId' });
    session.onConnect({ source: read.id, sourceHandle: 'value', target: output.id, targetHandle: 'value' });
    const inputPortId = session.graphDocument.value.interface.inputs[0].id;
    session.setGraphInputBinding({ portId: inputPortId, value: payload.fileId });

    expect(session.graphDocument.value.interface.inputs[0].contract.semantic.kind).toBe('documents.file-id');
    const result = await session.refreshPreview();
    const outputPortId = session.graphDocument.value.interface.outputs[0].id;
    expect(reads).toEqual([payload.fileId]);
    expect(result.outputs[outputPortId].payload).toMatchObject({
      mime: payload.mime,
      name: payload.name,
      base64: payload.base64
    });
    expect(session.executionRecord.value.provenance.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: { provider: 'plugin.documents', id: 'read-file', version: '1' } })
    ]));
  });

  it('uses HAG token metadata and node configuration values in the Markdown template graph operation', async () => {
    const documents = createDocumentsRuntime();
    const [provider] = documents.providers;
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        ...provider,
        execute: (definition, invocation) => documents.execute(definition.id, invocation)
      }]
    });
    const boundaries = session.paletteGroups.value.find(group => group.id === 'graph-boundaries');
    const input = session.addNode(boundaries.items[0], { x: 0, y: 0 });
    session.updateBoundaryDeclaration(input.id, {
      contract: { shape: 'item', semantic: { base: 'string' } },
      required: true
    });
    const output = session.addNode(boundaries.items[1], { x: 900, y: 0 });
    const fill = session.addNode(
      session.paletteGroups.value.flatMap(group => group.items).find(item => item.operation?.id === 'fill-markdown-template'),
      { x: 420, y: 0 }
    );
    session.updateNodeConfig(fill.id, { values: { name: 'Ada' } });
    session.onConnect({ source: input.id, sourceHandle: 'value', target: fill.id, targetHandle: 'templateText' });
    session.onConnect({ source: fill.id, sourceHandle: 'value', target: output.id, targetHandle: 'value' });
    session.setGraphInputBinding({
      portId: session.graphDocument.value.interface.inputs[0].id,
      value: '# Hello {name}'
    });

    const result = await session.refreshPreview();
    const file = result.outputs[session.graphDocument.value.interface.outputs[0].id];
    expect(Buffer.from(file.payload.base64, 'base64').toString('utf8')).toBe('# Hello Ada');
    expect(result.nodeOutputs[fill.id].value.meta.tokens).toEqual(['name']);
    expect(fill.data.definition.configuration.properties.values.semantic.kind).toBe('documents.template-values');
  });

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

  it('resolves canonical process operations through the shared plugin-SDK node contracts', () => {
    const graph = processDefinitionToGraphDocument({
      id: 'process.shared-node',
      dataflowVersion: 4,
      processNodes: {
        literal: { id: 'literal', kind: 'source.literalItem', value: 'shared' }
      },
      graph: {
        nodes: [{ id: 'literal-node', type: 'processNode', position: { x: 0, y: 0 }, data: { refId: 'literal' } }],
        edges: []
      }
    });
    const session = createSession();
    session.loadDocument(graph);
    const node = session.nodes.value.find(item => item.id === 'literal-node');
    expect(node.data.definition).toMatchObject({
      provider: 'perigram.processes',
      id: 'source.literalItem',
      version: '1',
      execution: { kind: 'pure' }
    });
  });

  it('preserves canonical edge kind and metadata through editor load/save', () => {
    const session = createSession();
    const [inputDefinition, outputDefinition] = session.paletteGroups.value[0].items;
    const input = session.addNode(inputDefinition, { x: 0, y: 0 });
    const output = session.addNode(outputDefinition, { x: 240, y: 0 });
    const graph = session.serializeGraph();
    graph.edges = [{
      id: 'semantic-wire',
      source: { node: input.id, port: 'value' },
      target: { node: output.id, port: 'value' },
      kind: 'control',
      metadata: { label: 'Continue', annotation: { source: 'migration' } }
    }];

    session.loadDocument(graph);
    expect(session.serializeGraph().edges).toEqual(graph.edges);
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
    session.updateBoundaryDeclaration(input.id, {
      contract: { shape: 'item', semantic: { base: 'number' } },
      required: true
    });
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

  it('rejects semantically different JSON kinds and validates persisted wires', async () => {
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        provider: 'plugin.example',
        definitions: [
          {
            provider: 'plugin.example', id: 'document.block', version: '1',
            palette: { group: 'documents', label: 'Documents' },
            inputs: [], outputs: [{ id: 'value', semantic: { base: 'json', kind: 'text.document-block' } }],
            execution: { kind: 'pure' }
          },
          {
            provider: 'plugin.example', id: 'document.consume', version: '1',
            palette: { group: 'documents', label: 'Documents' },
            inputs: [{ id: 'document', semantic: { base: 'json', kind: 'text.flow-document' } }],
            outputs: [{ id: 'value', semantic: { base: 'json', kind: 'text.flow-document' } }],
            execution: { kind: 'pure' }
          }
        ],
        execute: () => ({ value: {} })
      }]
    });
    const items = session.paletteGroups.value.flatMap(group => group.items);
    const block = session.addNode(items.find(item => item.operation?.id === 'document.block'), { x: 0, y: 0 });
    const consumer = session.addNode(items.find(item => item.operation?.id === 'document.consume'), { x: 200, y: 0 });
    session.onConnect({
      source: block.id, sourceHandle: 'value',
      target: consumer.id, targetHandle: 'document'
    });
    expect(session.edges.value).toHaveLength(0);

    session.edges.value = [{
      id: 'invalid-semantic-edge',
      source: block.id,
      sourceHandle: 'value',
      target: consumer.id,
      targetHandle: 'document'
    }];
    expect(session.validation.value.ok).toBe(false);
    expect(session.validation.value.errors.join(' ')).toContain('Representation kind');
    await expect(session.refreshPreview()).resolves.toBeNull();
  });

  it('surfaces conditional wires that require runtime value checks', () => {
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        provider: 'plugin.example',
        definitions: [
          {
            provider: 'plugin.example', id: 'maybe-value', version: '1',
            palette: { group: 'values', label: 'Values' },
            inputs: [],
            outputs: [{ id: 'value', semantic: { base: 'string' }, required: false }],
            execution: { kind: 'pure' }
          },
          {
            provider: 'plugin.example', id: 'required-value', version: '1',
            palette: { group: 'values', label: 'Values' },
            inputs: [{ id: 'value', semantic: { base: 'string' }, required: true }],
            outputs: [],
            execution: { kind: 'pure' }
          }
        ],
        execute: () => ({})
      }]
    });
    const items = session.paletteGroups.value.flatMap(group => group.items);
    const source = session.addNode(items.find(item => item.operation?.id === 'maybe-value'), { x: 0, y: 0 });
    const target = session.addNode(items.find(item => item.operation?.id === 'required-value'), { x: 220, y: 0 });
    session.onConnect({
      source: source.id, sourceHandle: 'value',
      target: target.id, targetHandle: 'value'
    });
    expect(session.edges.value).toHaveLength(1);
    expect(session.validation.value.ok).toBe(true);
    expect(session.validation.value.warnings.join(' ')).toContain('runtime value validation');
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
    session.updateBoundaryDeclaration(inputNode.id, {
      contract: { shape: 'item', semantic: { base: 'number' } },
      required: true
    });
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
