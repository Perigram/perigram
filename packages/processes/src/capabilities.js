function workflowArchived(workflow = null) {
  return Boolean(workflow && Object.values(workflow.regions || {}).some(region => (
    region.states && Object.prototype.hasOwnProperty.call(region.states, 'ARCHIVED')
  )));
}

function workflowArchiveIntent(workflow = null) {
  for (const region of Object.values(workflow?.regions || {})) {
    const transition = (region.transitions || []).find(item => item.to === 'ARCHIVED' && item.intent);
    if (transition) return transition.intent;
  }
  return null;
}

function entityFieldSchemas(domain = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

function entityConstruction(domain = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.construction?.[key] || domain.construction?.[camel] || null;
}

export function projectEntityProcessCapabilities(domain = {}, serviceBindings = {}) {
  const entities = Array.isArray(domain.entities) ? domain.entities : [];
  const bindings = serviceBindings || {};
  const result = {};

  for (const entity of entities) {
    const type = entity.type;
    const binding = bindings[type] || {};
    const construction = entityConstruction(domain, type);
    const workflow = domain.workflows?.[type] || null;
    const schemas = entityFieldSchemas(domain, type);
    const constructionHandlers = binding.constructionHandlers || {};
    const createModes = construction && Array.isArray(construction.modes)
      ? construction.modes.filter(mode => Object.hasOwn(constructionHandlers, mode))
      : [];

    result[type] = {
      list: Boolean(binding.list),
      getById: Boolean(binding.getById),
      create: createModes.length > 0,
      createModes,
      processUpdate: Boolean(binding.processUpdate),
      delete: Boolean(entity.operations?.delete) && Boolean(binding.delete),
      archive: Boolean(binding.archive) && workflowArchived(workflow),
      archiveIntent: workflowArchiveIntent(workflow),
      statusMutation: Boolean(workflow),
      writableFields: schemas.filter(field => field.writable === true).map(field => field.path),
      constructibleFields: schemas.filter(field => field.constructible !== false).map(field => field.path),
      relationMutations: (domain.relations || [])
        .filter(relation => relation.ownerType === type)
        .map(relation => ({
          key: relation.key,
          targetType: relation.targetType,
          cardinality: relation.cardinality
        }))
    };
  }

  return result;
}
