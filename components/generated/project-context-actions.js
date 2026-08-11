import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';

export function projectContextActionEntries({
  actionManifest = [],
  screenActionIds = [],
  projectActionIds = [],
  childSections = [],
  project = null,
  projectContext = {}
} = {}) {
  if (!project) return [];
  const parentType = projectContext?.parentEntityType || project.entityType || 'project';

  const childActionIds = new Set(childSections.flatMap(section => (
    (section.region?.actions || []).filter(actionId => {
      const action = actionManifest.find(candidate => candidate.actionId === actionId);
      return action?.actionKind === 'createEntity' && parentEntityType(action) === parentType;
    })
  )));
  const projectEntries = entriesForProject(
    [...screenActionIds, ...projectActionIds].filter(actionId => !childActionIds.has(actionId)),
    actionManifest,
    project,
    projectContext
  );
  const childCreateEntries = childSections.flatMap(section => childCreateActions({
    section,
    actionManifest,
    project,
    parentType
  }));

  return uniqueEntries([...projectEntries, ...childCreateEntries], actionManifest);
}

function entriesForProject(actionIds, actionManifest, project, context) {
  return [...new Set(actionIds)]
    .map(actionId => actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => actionAppliesToEntity(action, project, context?.parentEntityType || project.entityType || 'project'))
    .map(action => ({
      key: `project:${action.actionId}`,
      actionId: action.actionId,
      entity: project,
      context
    }));
}

function childCreateActions({ section = {}, actionManifest = [], project = null, parentType = 'project' } = {}) {
  return [...new Set(section.region?.actions || [])]
    .map(actionId => actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => (
      action.actionKind === 'createEntity'
      && action.entityType === section.entityType
      && parentEntityType(action) === parentType
      && actionAppliesToEntity(action, project, parentType)
    ))
    .map(action => ({
      key: `collection:${section.region?.id || section.entityType}:${action.actionId}`,
      actionId: action.actionId,
      entity: null,
      context: section.context || {}
    }));
}

function parentEntityType(action = {}) {
  return action.parentEntityType
    || action.inputs?.find(input => input.id === 'parent')?.entityType
    || '';
}

function uniqueEntries(entries = [], actionManifest = []) {
  return [...new Map(entries.map(entry => {
    const action = actionManifest.find(candidate => candidate.actionId === entry.actionId);
    return [visibleOperationKey(action, entry), entry];
  })).values()];
}

function visibleOperationKey(action = {}, entry = {}) {
  if (action.actionKind !== 'createEntity') return entry.actionId;
  return [
    'createEntity',
    action.entityType || '',
    parentEntityType(action)
  ].join(':');
}
