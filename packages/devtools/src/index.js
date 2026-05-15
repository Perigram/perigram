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
