import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';

const BLOCK_PRESENTATION = {
  identity: { defaultPath: 'identity.name', icon: 'pi pi-id-card', fields: ['identity.uid', 'identity.name', 'identity.slug', 'identity.serial', 'identity.reference'] },
  origin: { defaultPath: 'origin.state.primary', icon: 'pi pi-history', fields: ['origin.state.primary', 'origin.userId', 'origin.timestamp', 'origin.metadata', 'origin.eventId', 'origin.lifecycle'] },
  status: { defaultPath: 'status.state.primary', icon: 'pi pi-circle-fill', fields: ['status.state.primary', 'status.userId', 'status.timestamp', 'status.metadata', 'status.eventId', 'status.lifecycle'] },
  lineage: { defaultPath: 'lineage.organizationId', icon: 'pi pi-sitemap' },
  relations: { defaultPath: 'relations.value', icon: 'pi pi-link' },
  provenance: { defaultPath: 'provenance.source', icon: 'pi pi-directions-alt' },
  specs: { defaultPath: 'specs.width', icon: 'pi pi-list-check', fields: ['specs.width', 'specs.length', 'specs.area', 'specs.sheetThickness', 'specs.foilThickness'] },
  attachments: { defaultPath: 'attachments.primary', icon: 'pi pi-paperclip' },
  data: { defaultPath: 'data.value', icon: 'pi pi-database' },
  summary: { defaultPath: 'summary.value', icon: 'pi pi-chart-bar' }
};

export const PROCESS_DESIGNER_PALETTE_GROUPS = Object.freeze([
  {
    id: 'actions',
    items: [
      { type: 'action', actionKind: 'createEntity', icon: 'pi pi-plus', label: 'create' },
      { type: 'action', actionKind: 'updateEntity', icon: 'pi pi-pencil', label: 'modify' },
      { type: 'action', actionKind: 'runCommand', icon: 'pi pi-play', label: 'service' },
      { type: 'statusDefinition', icon: 'pi pi-circle-fill', label: 'status' }
    ]
  },
  {
    id: 'entities',
    items: [
      { type: 'valueInput', icon: 'pi pi-id-card', label: 'value' },
      { type: 'processNode', kind: 'entityRef', icon: 'pi pi-share-alt', label: 'entity' },
      { type: 'processNode', kind: 'fieldRead', icon: 'pi pi-box', label: 'blocks' },
      { type: 'processNode', kind: 'blockRead', icon: 'pi pi-search', label: 'field' },
      { type: 'processNode', kind: 'blockCompose', icon: 'pi pi-file-edit', label: 'compose' }
    ]
  },
  {
    id: 'logic',
    items: [
      { type: 'processNode', kind: 'stringOp', icon: 'pi pi-align-left', label: 'text' },
      { type: 'processNode', kind: 'compare', icon: 'pi pi-equals', label: 'compare' },
      { type: 'processNode', kind: 'logic', icon: 'pi pi-code', label: 'logic' },
      { type: 'processNode', kind: 'collection', icon: 'pi pi-list', label: 'list' }
    ]
  },
  {
    id: 'transfer',
    items: [
      { type: 'socket', direction: 'inbound', icon: 'pi pi-sign-in', label: 'receive' },
      { type: 'socket', direction: 'outbound', icon: 'pi pi-sign-out', label: 'send' }
    ]
  }
]);

export function createProcessDesignerContract(domain = {}) {
  const entities = Array.isArray(domain.entities) ? domain.entities : [];
  const entityByType = new Map(entities.map(entity => [entity.type, entity]));

  function fieldPolicy(entityType = '') {
    return lookupEntityContract(domain.fieldAccess, entityType) || {};
  }

  function construction(entityType = '') {
    return lookupEntityContract(domain.construction, entityType) || {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: []
    };
  }

  function blocks(entityType = '') {
    const declared = entityByType.get(entityType)?.blocks || [];
    const policyRoots = allFieldPaths(fieldPolicy(entityType))
      .map(path => String(path).split('.')[0]);
    const available = new Set([...declared, ...policyRoots]);
    return CANONICAL_ENTITY_BLOCKS
      .filter(id => available.has(id))
      .map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] }));
  }

  function fields(entityType = '', block = '') {
    const prefix = block ? `${block}.` : '';
    const coreFields = block
      ? (BLOCK_PRESENTATION[block]?.fields || [])
      : Object.values(BLOCK_PRESENTATION).flatMap(item => item.fields || []);
    const domainFields = Object.values(lookupEntityContract(domain.fieldGroups, entityType) || {})
      .flatMap(group => Array.isArray(group) ? group : [])
      .flatMap(field => [field.path, ...(field.fallbackPaths || [])])
      .filter(Boolean);
    return [...new Set([...coreFields, ...allFieldPaths(fieldPolicy(entityType)), ...domainFields])]
      .filter(path => !block || path === block || path.startsWith(prefix))
      .map(path => ({ label: path, value: path }));
  }

  return {
    domain,
    paletteGroups: PROCESS_DESIGNER_PALETTE_GROUPS,
    blocks: CANONICAL_ENTITY_BLOCKS.map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] })),
    entityOptions: entities.map(entity => ({ label: entity.label || entity.type, value: entity.type })),
    workflowOptions: Object.entries(domain.workflows || {}).map(([entityType, workflow]) => ({ label: workflow.label || entityType, value: entityType })),
    commandOptions: definitionOptions(domain.commands),
    taskOptions: definitionOptions(domain.tasks),
    eventOptions: definitionOptions(domain.events),
    hookOptions: definitionOptions(domain.hooks),
    effectOptions: definitionOptions(domain.effects),
    attachmentKindOptions: definitionOptions(domain.attachmentKinds, 'kind'),
    entity: entityType => entityByType.get(entityType) || null,
    fieldPolicy,
    construction,
    blocksForEntity: blocks,
    fieldsForEntity: fields
  };
}

function lookupEntityContract(contracts = {}, entityType = '') {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return contracts?.[key] || contracts?.[camel] || contracts?.[snake] || null;
}

function allFieldPaths(policy = {}) {
  return ['read', 'write', 'admin'].flatMap(level => Array.isArray(policy[level]) ? policy[level] : []);
}

function definitionOptions(definitions = {}, idKey = 'id') {
  const items = Array.isArray(definitions) ? definitions : Object.values(definitions || {});
  return items
    .map(definition => ({
      label: definition.label || definition.name || definition[idKey] || definition.id,
      value: definition[idKey] || definition.id
    }))
    .filter(option => option.value);
}
