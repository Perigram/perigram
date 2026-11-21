import { GRAPH_INVOKE_OPERATION } from '@perigram/core';

// The pinned graph identity names an invocation: the stored graph record
// carries the canonical id in its `graphId` field, so an invocation card
// reads its graph's name without downloading payloads.
export function graphInvocationName(config = {}, documents = [], fallback = '') {
  const graphId = String(config?.graphId || '');
  if (!graphId) return fallback;
  const record = (documents || []).find(item => String(item?.fields?.graphId || '') === graphId);
  return String(record?.name || '').trim() || fallback;
}

// Every readable graph document that pins `graphId` through a Use Graph
// node — the consumers whose interface snapshot an edit desynchronizes.
// `documents` is the graph catalog with payloads (`item.graph`); an
// unreadable payload cannot declare a pin and is skipped.
export function graphInvocationConsumers(documents = [], graphId = '') {
  const pinned = String(graphId || '');
  if (!pinned) return [];
  const consumers = [];
  for (const item of documents || []) {
    const graph = item?.graph;
    if (!graph || !Array.isArray(graph.nodes)) continue;
    if (String(graph.id || '') === pinned) continue;
    const invokes = graph.nodes.some(node => node?.operation?.id === GRAPH_INVOKE_OPERATION
      && String(node?.config?.graphId || '') === pinned);
    if (invokes) consumers.push({ id: String(item._id || item.id || ''), name: String(item.name || graph.name || graph.id || '') });
  }
  return consumers;
}
