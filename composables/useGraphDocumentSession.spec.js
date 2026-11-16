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
});
