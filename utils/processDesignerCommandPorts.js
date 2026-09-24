// Command service IO projection (pure): maps a domain command contract to
// the handle-shaped port rows the runCommand inspector panel renders.
// Extracted from the node-sync composable — it projects a definition-plane
// command, not a process-node record.

export function commandInputs(command = {}) {
  const abstractInputs = command?.input?.abstractEntities || [];
  const acceptedTypes = new Set(abstractInputs.flatMap(input => input.accepts || []));
  const abstractPorts = abstractInputs.map(input => ({
    id: input.name || input.type || input.capability,
    label: input.label,
    typeId: input.type,
    capability: input.capability,
    accepts: input.accepts || [],
    required: Boolean(input.required),
    multiple: Boolean(input.multiple),
    abstract: Boolean(input.capability || input.accepts?.length),
    prompt: false
  }));
  const entityPorts = (command?.input?.entities || [])
    .filter(input => !acceptedTypes.has(input.type))
    .map(input => ({
      id: input.name || input.type,
      label: input.label || input.name || input.type,
      typeId: input.type,
      kind: 'entity',
      required: Boolean(input.required),
      prompt: true,
      path: `entities.${input.name || input.type}`
    }));
  const parameterPorts = (command?.input?.parameters || []).map(input => ({
    id: input.name,
    label: input.label || input.name,
    kind: input.type === 'object' ? 'json' : input.type || 'data',
    type: input.type || 'string',
    options: input.options || [],
    default: input.default ?? null,
    required: Boolean(input.required),
    prompt: input.display !== 'hidden',
    path: `parameters.${input.name}`,
    dataPath: `parameters.${input.name}`,
    typeId: input.typeId || '',
    editor: input.editor || '',
    templateFieldId: input.templateFieldId || ''
  }));
  return [...abstractPorts, ...entityPorts, ...parameterPorts];
}

export function commandOutputs(command = {}) {
  return [
    ...(command?.output?.entities || []).map(typeId => ({
      id: typeId,
      typeId,
      multiple: true
    })),
    ...(command?.output?.attachments || []).map(kind => ({
      id: `attachment:${kind}`,
      label: kind,
      kind: 'attachment',
      multiple: true
    })),
    ...(command?.output?.tasks || []).map(task => ({
      id: `task:${task}`,
      label: task,
      kind: 'task'
    }))
  ];
}
