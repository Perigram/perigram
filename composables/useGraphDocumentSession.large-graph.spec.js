import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useGraphDocumentSession } from './useGraphDocumentSession.js';
import { largeGraphDefinition, largeGraphDocument } from '#test-data/graph-editor-large.js';

function largeSession(operations = 120) {
  const resolver = vi.fn(() => largeGraphDefinition());
  const session = useGraphDocumentSession({ t: key => key, nodeResolvers: [resolver] });
  session.loadDocument(largeGraphDocument({ operations }));
  return { session, resolver };
}

describe('large graph editor derivation', () => {
  it('resolves each node definition once per load and reuses it across validation', async () => {
    const { session, resolver } = largeSession(120);
    await nextTick();
    expect(resolver).toHaveBeenCalledTimes(120);
    expect(session.validation.value.ok).toBe(true);
    expect(Object.keys(session.nodeDefinitions.value)).toHaveLength(122);
  });

  it('keeps position-only edits and selection churn out of definition and validation work', async () => {
    const { session, resolver } = largeSession(80);
    await nextTick();
    const validation = session.validation.value;
    resolver.mockClear();

    session.nodes.value = session.nodes.value.map(node => ({
      ...node,
      position: { x: Number(node.position?.x || 0) + 40, y: 24 }
    }));
    await nextTick();
    expect(resolver).not.toHaveBeenCalled();
    expect(session.validation.value).toBe(validation);

    session.selectNode(session.nodes.value[1]);
    session.selectEdge(session.edges.value[1]);
    session.clearGraphSelection();
    await nextTick();
    expect(resolver).not.toHaveBeenCalled();
    expect(session.validation.value).toBe(validation);
  });

  it('resolves only the edited node on a configuration change', async () => {
    const { session, resolver } = largeSession(80);
    await nextTick();
    const edited = session.nodes.value.find(node => node.id === 'pass-40');
    resolver.mockClear();

    session.updateNodeConfig(edited.id, { marker: 'changed' });
    await nextTick();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(session.nodeDefinitions.value[edited.id]).toBeTruthy();
  });

  it('reuses cached definitions for connection changes', async () => {
    const { session, resolver } = largeSession(80);
    await nextTick();
    resolver.mockClear();

    session.onConnect({ source: 'pass-10', sourceHandle: 'value', target: 'output-value', targetHandle: 'value' });
    await nextTick();
    expect(resolver).not.toHaveBeenCalled();
  });
});
