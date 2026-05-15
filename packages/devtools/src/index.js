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

export function summarizeSummaries(summaries = []) {
  return summaries.map(summary => ({
    entityType: summary.entityType,
    parentType: summary.parentType,
    parentIdKey: summary.parentIdKey,
    countField: summary.countField || null,
    sumFields: summary.sumFields || {}
  }));
}

export function summarizeRelationships({ summaries = [], dataModelFields = [] } = {}) {
  const summaryRelationships = summaries.map(summary => ({
    source: summary.parentType,
    target: summary.entityType,
    via: `lineage.${summary.parentIdKey}`,
    kind: 'summary'
  }));

  const lineageRelationships = dataModelFields
    .filter(field => field.name?.startsWith('lineage.') && field.name.endsWith('Id'))
    .map(field => ({
      source: field.name.replace(/^lineage\./, '').replace(/Id$/, ''),
      target: field.entityType,
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
    entityType: contract.entityType,
    group: contract.group,
    labelKey: contract.labelKey,
    propName: contract.propName,
    status: contract.status,
    trace: contract.trace,
    docs: contract.docs || [],
    componentPath: componentInventory[contract.key]?.componentPath || null,
    fieldPaths: componentInventory[contract.key]?.fieldPaths || []
  }));
}

export function validateUiFieldPaths({ components = [], dataModelFields = [], compatibilityAliases = {} } = {}) {
  const canonicalFields = new Set(dataModelFields.map(field => `${field.entityType}:${field.name}`));
  const issues = [];

  for (const component of components) {
    for (const path of component.fieldPaths || []) {
      if (isAllowedFieldPath(component.entityType, path, canonicalFields, compatibilityAliases)) continue;
      issues.push({
        key: component.key,
        entityType: component.entityType,
        path,
        issue: 'unknown-ui-field-path'
      });
    }
  }

  return issues;
}

export function validateStatusPolicies({ components = [], workflows = {} } = {}) {
  return components
    .filter(component => component.status === 'interactive' && workflows[component.entityType])
    .flatMap(component => {
      const workflow = workflows[component.entityType];
      if (workflow.initial && Object.keys(workflow.states || {}).length > 0) return [];
      return [{ key: component.key, entityType: component.entityType, issue: 'invalid-workflow-status-policy' }];
    });
}

export function createFrameworkManifest({
  packages = [],
  entities = [],
  frontendEntities = [],
  workflows = {},
  summaries = [],
  designSystem = {},
  dataModelFields = [],
  compatibilityAliases = {}
} = {}) {
  const workflowEntries = Object.entries(workflows).map(([type, workflow]) => ({ type, workflow }));
  const uiComponents = summarizeUiComponents(designSystem.contracts || [], designSystem.componentInventory || {});

  return {
    schemaVersion: 1,
    name: 'cutkit-framework',
    packages,
    entities: summarizeDefinitions(entities),
    routes: summarizeRoutes(frontendEntities),
    workflows: summarizeWorkflows(workflowEntries),
    summaries: summarizeSummaries(summaries),
    relationships: summarizeRelationships({ summaries, dataModelFields }),
    designSystem: {
      variants: designSystem.variants || [],
      groups: designSystem.groups || [],
      components: uiComponents,
      tokens: designSystem.tokens || {}
    },
    validations: validateFrameworkManifest({
      entities,
      workflows,
      uiComponents,
      dataModelFields,
      compatibilityAliases
    })
  };
}

export function validateFrameworkManifest({
  entities = [],
  workflows = {},
  uiComponents = [],
  dataModelFields = [],
  compatibilityAliases = {}
} = {}) {
  const definitionResult = validateDefinitionSet(entities);
  const uiFieldIssues = validateUiFieldPaths({ components: uiComponents, dataModelFields, compatibilityAliases });
  const statusIssues = validateStatusPolicies({ components: uiComponents, workflows });
  const issues = [
    ...definitionResult.errors.map(error => ({ area: 'entities', issue: error })),
    ...uiFieldIssues.map(issue => ({ area: 'ui-fields', ...issue })),
    ...statusIssues.map(issue => ({ area: 'status-policy', ...issue }))
  ];

  return {
    ok: issues.length === 0,
    issues
  };
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

function isAllowedFieldPath(entityType, path, canonicalFields, compatibilityAliases) {
  const aliases = new Set(compatibilityAliases[entityType] || []);
  if (aliases.has(path)) return true;

  const [root] = path.split('.');
  if (['identity', 'status', 'origin', 'lineage', 'attachments', 'specs', 'summary'].includes(root)) return true;

  if (!path.startsWith('data.')) return false;
  const dataRoot = path.split('.').slice(0, 2).join('.');
  return canonicalFields.has(`${entityType}:${dataRoot}`) || aliases.has(dataRoot);
}
