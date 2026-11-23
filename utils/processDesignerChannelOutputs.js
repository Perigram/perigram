import { formatProcessType } from '#packages/processes';

// Pure preview-output display (SPEC §28): the branch/value formatters
// every output surface shares, and the built-in outputs channel's entry
// derivation over a whole-graph channel payload.

export function formatPreviewPath(path = []) {
  return `{${path.join(';')}}`;
}

export function formatPreviewItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item) && item.missing === true) {
    const path = Array.isArray(item.path) ? item.path.join('.') : String(item.path ?? '');
    return `missing(${path})`;
  }
  return JSON.stringify(item);
}

export function formatPreviewItems(items = []) {
  return items.map(formatPreviewItem).join(', ');
}

// One entry per evaluated node of the channel payload, labeled the way
// the canvas names its cards: `groupLabel`/`kindLabel` and the port
// specs come from the enriched live node data. `visiblePreviewOutputs`
// has already filtered hidden outputs; a hidden node keeps its error.
export function graphOutputEntries(payload = {}, nodes = []) {
  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  return Object.entries(payload?.nodes || {}).map(([id, evaluation]) => {
    const data = nodeById.get(String(id))?.data || {};
    const specs = data.outputSpecs || [];
    return {
      id,
      section: data.groupLabel || '',
      label: data.kindLabel || data.label || id,
      error: evaluation?.error || '',
      outputs: Object.entries(evaluation?.outputs || {}).map(([socketId, tree]) => {
        const port = specs.find(spec => spec.id === socketId);
        return {
          id: socketId,
          label: port?.label || socketId,
          type: port?.type ? formatProcessType(port.type) : '',
          representation: port?.representation
            || port?.type?.representation
            || port?.contract?.semantic?.representation
            || '',
          tree
        };
      })
    };
  });
}
