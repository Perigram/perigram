import { describe, expect, it } from 'vitest';
import { useGraphDocumentSession } from './useGraphDocumentSession.js';

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

  it('composes an independently registered plugin provider into the palette and preview runtime', async () => {
    const definition = {
      provider: 'plugin.example',
      id: 'math.double',
      version: '1',
      label: 'Double',
      inputs: [{ id: 'value', shape: 'item', semantic: { base: 'number' }, required: true }],
      outputs: [{ id: 'result', shape: 'item', semantic: { base: 'number' }, required: true }],
      execution: { kind: 'pure', deterministic: true }
    };
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        definitions: [definition],
        execute: (_definition, { inputs }) => ({ result: inputs.value * 2 })
      }]
    });
    const pluginGroup = session.paletteGroups.value.find(group => group.source === 'plugin');
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
