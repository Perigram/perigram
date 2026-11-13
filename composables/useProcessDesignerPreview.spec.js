import { describe, expect, it, vi } from 'vitest';
import { useProcessDesignerPreview, visiblePreviewOutputs } from './useProcessDesignerPreview.js';

// The diagnostic focus contract: a node-anchored diagnostic selects the node
// and frames it into view; an edge-anchored diagnostic selects the edge and
// frames both endpoints; a passing validation never moves the viewport.
function mountPreview({ nodes = [], edges = [], frameNodeIds, graphEvaluation, selectedProcessNode } = {}) {
  const selectNode = vi.fn();
  const selectEdge = vi.fn();
  const preview = useProcessDesignerPreview({
    t: key => key,
    validation: { value: null },
    selectedNode: { value: null },
    selectedNodeId: { value: null },
    selectedProcessNode: { value: selectedProcessNode || null },
    processNodeOutputs: () => [],
    persistence: {},
    serializeProcess: () => ({}),
    nodes: { value: nodes },
    edges: { value: edges },
    selectNode,
    selectEdge,
    ...(frameNodeIds ? { frameNodeIds } : {}),
    ...(graphEvaluation ? { graphEvaluation: { value: graphEvaluation } } : {})
  });
  return { preview, selectNode, selectEdge };
}

describe('useProcessDesignerPreview diagnostic focus', () => {
  it('selects and frames the node a diagnostic anchors', () => {
    const node = { id: 'n1', type: 'processNode' };
    const frameNodeIds = vi.fn();
    const { preview, selectNode } = mountPreview({ nodes: [node], frameNodeIds });

    preview.focusValidationDiagnostic({ nodeId: 'n1', socketId: 'name' });

    expect(selectNode).toHaveBeenCalledWith(node);
    expect(frameNodeIds).toHaveBeenCalledWith(['n1']);
  });

  it('selects an edge diagnostic and frames both endpoints', () => {
    const edge = { id: 'e1', source: 'a', target: 'b' };
    const frameNodeIds = vi.fn();
    const { preview, selectEdge } = mountPreview({ edges: [edge], frameNodeIds });

    preview.focusValidationDiagnostic({ edgeId: 'e1' });

    expect(selectEdge).toHaveBeenCalledWith(edge);
    expect(frameNodeIds).toHaveBeenCalledWith(['a', 'b']);
  });

  it('never focuses when validation passed or no diagnostic carries an anchor', () => {
    const frameNodeIds = vi.fn();
    const { preview } = mountPreview({ frameNodeIds });

    preview.focusFirstValidationDiagnostic({ ok: true });
    preview.focusFirstValidationDiagnostic({ ok: false, diagnostics: [{ message: 'no anchors' }] });

    expect(frameNodeIds).not.toHaveBeenCalled();
  });

  it('folds whole-graph evaluation errors into the node diagnostic index (SPEC §28)', () => {
    const graphEvaluation = {
      nodes: {
        good: { outputs: { value: { branches: [] } } },
        bad: { outputs: {}, error: 'Division by zero' }
      }
    };
    const { preview } = mountPreview({ graphEvaluation });

    expect(preview.nodeDiagnostics.value('bad')).toEqual(['Division by zero']);
    expect(preview.nodeDiagnostics.value('good')).toBeNull();
    expect(preview.nodeDiagnostics.value('absent')).toBeNull();
  });
});

describe('useProcessDesignerPreview node support', () => {
  it.each([
    [{ kind: 'cts.service' }, true],
    [{ kind: 'cts.read' }, true],
    [{ kind: 'value.format' }, true],
    [{ kind: 'cts.mutate' }, false],
    [{ kind: 'control.forEach' }, false],
    [{}, false]
  ])('node %j previews: %s', async (record, expected) => {
    const { preview } = await mountPreview({ selectedProcessNode: record });
    expect(preview.selectedNodeSupportsPreview.value).toBe(expected);
  });
});

describe('visiblePreviewOutputs', () => {
  const evaluation = {
    nodes: {
      a: { outputs: { result: { branches: [] }, extra: { branches: [] } }, error: 'boom' },
      b: { outputs: { value: { branches: [] } } }
    }
  };
  const definition = {
    graph: { nodes: [{ id: 'a', data: { refId: 'r1' } }, { id: 'b', data: { refId: 'r2' } }] },
    processNodes: { r1: { id: 'r1' }, r2: { id: 'r2' } }
  };

  it('carries every output when no record selects', () => {
    expect(visiblePreviewOutputs(evaluation, definition)).toEqual(evaluation);
  });

  it('selects the authored outputs per record and keeps errors', () => {
    const selected = visiblePreviewOutputs(evaluation, {
      ...definition,
      processNodes: { r1: { id: 'r1', previewOutputs: ['result'] }, r2: { id: 'r2' } }
    });
    expect(Object.keys(selected.nodes.a.outputs)).toEqual(['result']);
    expect(selected.nodes.a.error).toBe('boom');
    expect(Object.keys(selected.nodes.b.outputs)).toEqual(['value']);
  });

  it('treats a record-less evaluation node as unselected', () => {
    const selected = visiblePreviewOutputs({ nodes: { x: { outputs: { value: {} } } } }, definition);
    expect(Object.keys(selected.nodes.x.outputs)).toEqual(['value']);
  });
});
