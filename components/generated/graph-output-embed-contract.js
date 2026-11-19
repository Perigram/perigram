// The graph-output embed contract's component-free leaf: the render
// policy (live evaluation at a pinned revision, page-resolved
// parameters, retained pinned execution, frozen snapshot) and the
// picker payloads that author each mode. The block grammar lives in
// #shared/page-document.js; the resolution seam in the pages feature
// README.

export function collectionEmbedView({ collection = {}, resolution = null, live = null, loading = false } = {}) {
  const policy = collection.resultPolicy === 'live' ? 'live'
    : (Array.isArray(collection.snapshot?.items) ? 'frozen' : 'pinned');
  if (policy === 'frozen') return { phase: 'ready', mode: 'frozen', result: collection.snapshot };
  if (policy === 'live') {
    if (!resolution) return { phase: 'loading', mode: 'live' };
    return resolution.status === 'resolved'
      ? { phase: 'ready', mode: 'live', result: resolution }
      : { phase: 'unavailable', mode: 'live' };
  }
  const parameters = collection.parameters && typeof collection.parameters === 'object' && !Array.isArray(collection.parameters)
    ? collection.parameters
    : {};
  if (Object.keys(parameters).length) {
    if (!resolution) return { phase: 'loading', mode: 'parameterized' };
    return resolution.status === 'resolved'
      ? { phase: 'ready', mode: 'parameterized', result: resolution }
      : { phase: 'unavailable', mode: 'parameterized' };
  }
  if (loading) return { phase: 'loading', mode: 'pinned' };
  return live ? { phase: 'ready', mode: 'pinned', result: live } : { phase: 'unavailable', mode: 'pinned' };
}

function graphSource(output = {}) {
  return {
    kind: 'graph-output',
    executionInstanceId: String(output.executionInstanceId || ''),
    graphDocumentInstanceId: String(output.graphDocumentInstanceId || ''),
    graphId: String(output.graphId || ''),
    graphRevision: String(output.graphRevision || ''),
    outputId: String(output.outputId || '')
  };
}

// A live embed pins the graph definition revision and declared output;
// the pages resolution seam re-evaluates it on every page load.
export function liveGraphEmbed({ graphDocumentInstanceId, graphId, graphRevision }, output = {}, parameters = {}) {
  return {
    source: {
      kind: 'graph-output',
      graphDocumentInstanceId: String(graphDocumentInstanceId || ''),
      graphId: String(graphId || ''),
      graphRevision: String(graphRevision || ''),
      outputId: String(output.id || '')
    },
    parameters: parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? parameters : {},
    resultPolicy: 'live'
  };
}

export function retainedCollectionEmbed(output = {}) {
  return { source: graphSource(output), parameters: {}, resultPolicy: 'pinned' };
}

export function frozenCollectionEmbed(output = {}, resolved = {}) {
  return {
    ...retainedCollectionEmbed(output),
    snapshot: {
      label: String(resolved.label || output.label || output.outputId || ''),
      itemCount: Number.isInteger(Number(resolved.itemCount)) && Number(resolved.itemCount) >= 0 ? Number(resolved.itemCount) : 0,
      truncated: resolved.truncated === true,
      items: Array.isArray(resolved.items) ? resolved.items.slice(0, 100) : []
    },
    resultPolicy: 'frozen'
  };
}
