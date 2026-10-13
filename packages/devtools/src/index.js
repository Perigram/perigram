export function summarizeDefinitions(definitions = []) {
  return definitions.map(definition => ({
    type: definition.type,
    collection: definition.collection,
    ...(definition.meta ? { meta: true } : {}),
    blocks: definition.blocks || [],
    lineage: definition.lineage || {}
  }));
}

export function summarizeWorkflows(workflows = []) {
  return workflows.map(({ type, workflow }) => ({
    type,
    initial: workflow.initial || workflow.regions?.[workflow.primaryRegion || 'main']?.initial,
    states: Object.values(workflow.regions || { main: workflow }).flatMap(region => Object.keys(region.states || {})),
    regions: Object.keys(workflow.regions || { main: workflow }),
    transitionCount: Object.values(workflow.regions || { main: workflow })
      .reduce((total, region) => total + (region.transitions?.length || 0), 0)
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

export function summarizeSummaries(summaries = []) {
  return summaries.map(summary => ({
    typeId: summary.typeId,
    parentType: summary.parentType,
    parentIdKey: summary.parentIdKey,
    countField: summary.countField || null,
    sumFields: summary.sumFields || {}
  }));
}

export function summarizeCommands(commands = {}) {
  return Object.entries(commands).map(([id, action]) => ({
    id,
    service: action.service,
    action: action.action,
    label: action.label || id,
    inputs: summarizeInputs(action.input),
    outputs: (action.output?.entities || []).map(entry => entry?.type).filter(Boolean),
    attachments: action.output?.attachments || [],
    tasks: action.output?.tasks || [],
    events: action.output?.events || [],
    triggers: action.triggers || [],
    permissions: action.access?.permissions || []
  }));
}

export function summarizeTasks(tasks = {}) {
  return Object.entries(tasks).map(([key, task]) => ({
    key,
    id: task.id,
    service: task.service,
    label: task.label || task.id,
    executor: task.executor || null,
    inputs: summarizeInputs(task.input),
    outputs: (task.output?.entities || []).map(entry => entry?.type).filter(Boolean),
    attachments: task.output?.attachments || [],
    tasks: task.output?.tasks || [],
    events: task.output?.events || []
  }));
}

function summarizeInputs(input = {}) {
  const abstractInputs = input.abstractEntities || [];
  if (abstractInputs.length) {
    return abstractInputs.map(item => item.capability || item.label || item.name);
  }
  return (input.entities || []).map(item => item.type);
}

export function summarizeAttachmentKinds(attachmentKinds = {}) {
  return Object.entries(attachmentKinds).map(([key, attachment]) => ({
    key,
    kind: attachment.kind || key,
    bucket: attachment.bucket || null,
    mimeType: attachment.mimeType || null,
    preview: attachment.preview || { mode: 'download' }
  }));
}

export function summarizeRelationships({ summaries = [], dataModelFields = [] } = {}) {
  const summaryRelationships = summaries.map(summary => ({
    source: summary.parentType,
    target: summary.typeId,
    via: `lineage.${summary.parentIdKey}`,
    kind: 'summary'
  }));

  const lineageRelationships = dataModelFields
    .filter(field => field.name?.startsWith('lineage.') && field.name.endsWith('Id'))
    .map(field => ({
      source: field.name.replace(/^lineage\./, '').replace(/Id$/, ''),
      target: field.typeId,
      via: field.name,
      kind: 'lineage'
    }));

  return [...summaryRelationships, ...lineageRelationships]
    .filter((relationship, index, all) => all.findIndex(item =>
      item.source === relationship.source &&
      item.target === relationship.target &&
      item.via === relationship.via &&
      item.kind === relationship.kind
    ) === index)
    .sort((a, b) => `${a.kind}:${a.source}:${a.target}`.localeCompare(`${b.kind}:${b.source}:${b.target}`));
}

export function summarizeUiComponents(contracts = [], componentInventory = {}) {
  return contracts.map(contract => ({
    key: contract.key,
    typeId: contract.typeId,
    group: contract.group,
    labelKey: contract.labelKey,
    propName: contract.propName,
    status: contract.status,
    trace: contract.trace,
    componentPath: componentInventory[contract.key]?.componentPath || null,
    fieldPaths: componentInventory[contract.key]?.fieldPaths || []
  }));
}

export function summarizeUiPrimitives(primitives = []) {
  return primitives.map(primitive => ({
    key: primitive.key,
    kind: primitive.kind,
    componentPath: primitive.componentPath,
    purpose: primitive.purpose
  }));
}

export function validateUiFieldPaths({ components = [], dataModelFields = [] } = {}) {
  const canonicalFields = new Set(dataModelFields.map(field => `${field.typeId}:${field.name}`));
  const issues = [];

  for (const component of components) {
    for (const path of component.fieldPaths || []) {
      if (isAllowedFieldPath(component.typeId, path, canonicalFields)) continue;
      issues.push({
        key: component.key,
        typeId: component.typeId,
        path,
        issue: 'unknown-ui-field-path'
      });
    }
  }

  return issues;
}

export function validateStatusPolicies({ components = [], workflows = {} } = {}) {
  return components
    .filter(component => component.status === 'interactive' && workflows[component.typeId])
    .flatMap(component => {
      const workflow = workflows[component.typeId];
      const regions = workflow.regions || { main: workflow };
      if ((workflow.initial || regions[workflow.primaryRegion || 'main']?.initial) && Object.values(regions).some(region => Object.keys(region.states || {}).length > 0)) return [];
      return [{ key: component.key, typeId: component.typeId, issue: 'invalid-workflow-status-policy' }];
    });
}

export function validateUiPrimitives(primitives = []) {
  return primitives.flatMap(primitive => {
    const issues = [];
    if (!primitive.key) issues.push('missing key');
    if (!primitive.kind) issues.push('missing kind');
    if (!primitive.componentPath) issues.push('missing component path');
    if (!primitive.purpose) issues.push('missing purpose');
    return issues.map(issue => ({ key: primitive.key || 'unknown', issue }));
  });
}

export function createFrameworkManifest({
  packages = [],
  entities = [],
  frontendEntities = [],
  workflows = {},
  commands = {},
  tasks = {},
  attachmentKinds = {},
  summaries = [],
  designSystem = {},
  dataModelFields = []
} = {}) {
  const workflowEntries = Object.entries(workflows).map(([type, workflow]) => ({ type, workflow }));
  const uiComponents = summarizeUiComponents(designSystem.contracts || [], designSystem.componentInventory || {});
  const uiPrimitives = summarizeUiPrimitives(designSystem.primitives || []);

  return {
    schemaVersion: 1,
    name: 'perigram-framework',
    packages,
    entities: summarizeDefinitions(entities),
    routes: summarizeRoutes(frontendEntities),
    workflows: summarizeWorkflows(workflowEntries),
    summaries: summarizeSummaries(summaries),
    commands: summarizeCommands(commands),
    tasks: summarizeTasks(tasks),
    attachmentKinds: summarizeAttachmentKinds(attachmentKinds),
    relationships: summarizeRelationships({ summaries, dataModelFields }),
    designSystem: {
      variants: designSystem.variants || [],
      groups: designSystem.groups || [],
      primitives: uiPrimitives,
      components: uiComponents,
      tokens: designSystem.tokens || {}
    },
    validations: validateFrameworkManifest({
      entities,
      workflows,
      uiComponents,
      uiPrimitives,
      commands,
      tasks,
      attachmentKinds,
      dataModelFields,
    })
  };
}

export function validateFrameworkManifest({
  entities = [],
  workflows = {},
  commands = {},
  tasks = {},
  attachmentKinds = {},
  uiComponents = [],
  uiPrimitives = [],
  dataModelFields = []
} = {}) {
  const definitionResult = validateDefinitionSet(entities);
  const uiFieldIssues = validateUiFieldPaths({ components: uiComponents, dataModelFields });
  const statusIssues = validateStatusPolicies({ components: uiComponents, workflows });
  const workflowAccessIssues = validateWorkflowAccess(workflows);
  const commandIssues = validateCommands(commands);
  const  taskIssues = validateTasks(tasks);
  const attachmentKindIssues = validateAttachmentKinds(attachmentKinds);
  const primitiveIssues = validateUiPrimitives(uiPrimitives);
  const issues = [
    ...definitionResult.errors.map(error => ({ area: 'entities', issue: error })),
    ...uiFieldIssues.map(issue => ({ area: 'ui-fields', ...issue })),
    ...statusIssues.map(issue => ({ area: 'status-policy', ...issue })),
    ...workflowAccessIssues.map(issue => ({ area: 'workflow-access', ...issue })),
    ...commandIssues.map(issue => ({ area: 'commands', ...issue })),
    ... taskIssues.map(issue => ({ area: 'tasks', ...issue })),
    ...attachmentKindIssues.map(issue => ({ area: 'attachment-kinds', ...issue })),
    ...primitiveIssues.map(issue => ({ area: 'ui-primitives', ...issue }))
  ];

  return {
    ok: issues.length === 0,
    issues
  };
}

export function validateWorkflowAccess(workflows = {}) {
  return Object.entries(workflows).flatMap(([type, workflow]) => Object.entries(workflow.regions || { main: workflow }).flatMap(([regionId, region]) => (region.transitions || []).flatMap((transition, index) => {
    const issues = [];
    if (transition.roles) issues.push({ type, region: regionId, index, issue: 'legacy roles are not allowed' });
    if (!transition.access?.system && !Array.isArray(transition.access?.permissions)) {
      issues.push({ type, region: regionId, index, issue: 'missing access permissions' });
    }
    return issues;
  })));
}

export function validateCommands(commands = {}) {
  return Object.entries(commands).flatMap(([id, action]) => {
    const issues = [];
    if (action.id && action.id !== id) issues.push({ id, issue: 'command id mismatch' });
    if (!action.service) issues.push({ id, issue: 'missing service' });
    if (!action.action) issues.push({ id, issue: 'missing action' });
    if (!Array.isArray(action.access?.permissions)) issues.push({ id, issue: 'missing access permissions' });
    if (action.input?.data === true) issues.push({ id, issue: 'legacy input.data contract' });
    if (action.input?.parameters && !Array.isArray(action.input.parameters)) issues.push({ id, issue: 'command parameters must be an array' });
    return issues;
  });
}

export function validateTasks(tasks = {}) {
  return Object.entries(tasks).flatMap(([key, task]) => {
    const issues = [];
    if (!task.id) issues.push({ key, issue: 'missing task id' });
    if (!task.service) issues.push({ key, issue: 'missing service' });
    if (!task.executor?.type) issues.push({ key, issue: 'missing executor type' });
    if (task.input?.parameters && !Array.isArray(task.input.parameters)) issues.push({ key, issue: 'task parameters must be an array' });
    return issues;
  });
}

export function validateAttachmentKinds(attachmentKinds = {}) {
  return Object.entries(attachmentKinds).flatMap(([key, artifact]) => {
    const issues = [];
    if (!artifact.kind) issues.push({ key, issue: 'missing attachment kind' });
    if (!artifact.bucket) issues.push({ key, issue: 'missing bucket' });
    if (!artifact.mimeType) issues.push({ key, issue: 'missing mime type' });
    if (!artifact.preview?.mode) issues.push({ key, issue: 'missing preview kind' });
    return issues;
  });
}

export function validateDefinitionSet(definitions = []) {
  const errors = [];
  const seen = new Set();
  for (const definition of definitions) {
    if (!definition.type) errors.push('Entity definition missing type');
    if (seen.has(definition.type)) errors.push(`Duplicate entity definition: ${definition.type}`);
    seen.add(definition.type);
    // Party entities are readable principals: their feature services own
    // storage, so no class collection projects for them.
    if (!definition.collection && !definition.party) errors.push(`Entity ${definition.type} missing collection`);
  }
  return { ok: errors.length === 0, errors };
}

function isAllowedFieldPath(typeId, path, canonicalFields) {
  const [root] = path.split('.');
  if (['identity', 'status', 'origin', 'lineage', 'attachments', 'specs', 'summary'].includes(root)) return true;

  if (!path.startsWith('data.')) return false;
  const dataRoot = path.split('.').slice(0, 2).join('.');
  return canonicalFields.has(`${typeId}:${dataRoot}`);
}
