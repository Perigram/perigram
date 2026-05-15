export function summarizeDefinitions(definitions = []) {
  return definitions.map(definition => ({
    type: definition.type,
    collection: definition.collection,
    blocks: definition.blocks || [],
    lineage: definition.lineage || {}
  }));
}

export function summarizeWorkflows(workflows = []) {
  return workflows.map(({ type, workflow }) => ({
    type,
    initial: workflow.initial,
    states: Object.keys(workflow.states || {}),
    transitionCount: workflow.transitions?.length || 0
  }));
}

export function summarizeRoutes(definitions = []) {
  return definitions.map(definition => ({
    type: definition.type,
    collection: definition.collection,
    single: definition.routes?.single || null,
    list: definition.routes?.list || null
  }));
}

export function queryDocs(corpus = [], query = '') {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];

  return corpus
    .map(document => {
      const content = String(document.content || '');
      const index = content.toLowerCase().indexOf(needle);
      if (index === -1) return null;

      const start = Math.max(0, index - 120);
      const end = Math.min(content.length, index + needle.length + 120);
      return {
        path: document.path,
        title: document.title || document.path,
        snippet: content.slice(start, end).replace(/\s+/g, ' ').trim()
      };
    })
    .filter(Boolean);
}

export function validateDefinitionSet(definitions = []) {
  const errors = [];
  const seen = new Set();
  for (const definition of definitions) {
    if (!definition.type) errors.push('Entity definition missing type');
    if (seen.has(definition.type)) errors.push(`Duplicate entity definition: ${definition.type}`);
    seen.add(definition.type);
    if (!definition.collection) errors.push(`Entity ${definition.type} missing collection`);
  }
  return { ok: errors.length === 0, errors };
}
