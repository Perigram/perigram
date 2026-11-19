// The graph-output embed contract's component-free leaf: the render
// policy (frozen snapshot, page-resolved parameters, live pinned
// execution) and the picker payloads that author each mode. The block
// grammar lives in #shared/page-document.js; the resolution seam in the
// pages feature README.

export function collectionEmbedView({ collection = {}, resolution = null, live = null, loading = false } = {}) {
  if (Array.isArray(collection.snapshot?.items)) return { phase: 'ready', result: collection.snapshot };
  const parameters = collection.parameters && typeof collection.parameters === 'object' && !Array.isArray(collection.parameters)
    ? collection.parameters
    : {};
  if (Object.keys(parameters).length) {
    if (!resolution) return { phase: 'loading' };
    return resolution.status === 'resolved'
      ? { phase: 'ready', result: resolution }
      : { phase: 'unavailable' };
  }
  if (loading) return { phase: 'loading' };
  return live ? { phase: 'ready', result: live } : { phase: 'unavailable' };
}

export function liveCollectionEmbed(output = {}) {
  return {
    source: {
      kind: 'graph-output',
      executionInstanceId: String(output.executionInstanceId || ''),
      graphDocumentInstanceId: String(output.graphDocumentInstanceId || ''),
      graphId: String(output.graphId || ''),
      graphRevision: String(output.graphRevision || ''),
      outputId: String(output.outputId || '')
    },
    parameters: {},
    resultPolicy: 'pinned'
  };
}

export function frozenCollectionEmbed(output = {}, resolved = {}) {
  return {
    ...liveCollectionEmbed(output),
    snapshot: {
      label: String(resolved.label || output.label || output.outputId || ''),
      itemCount: Number.isInteger(Number(resolved.itemCount)) && Number(resolved.itemCount) >= 0 ? Number(resolved.itemCount) : 0,
      truncated: resolved.truncated === true,
      items: Array.isArray(resolved.items) ? resolved.items.slice(0, 100) : []
    },
    resultPolicy: 'frozen'
  };
}
