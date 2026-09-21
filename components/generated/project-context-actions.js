import { actionAppliesToEntity, isCreateAction, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';

export function projectContextActionEntries({
  actionManifest = [],
  screenActionIds = [],
  projectActionIds = [],
  childSections = [],
  project = null,
  projectContext = {}
} = {}) {
  if (!project) return [];
  const parentType = projectContext?.parentTypeId || 'project';

  const childActionIds = new Set(childSections.flatMap(section => (
    (section.region?.actions || []).filter(actionId => {
      const action = actionManifest.find(candidate => candidate.id === actionId);
      return isCreateAction(action) && action?.parentTypeId === parentType;
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
    .map(actionId => actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => actionAppliesToEntity(action, project, context?.parentTypeId || 'project'))
    .map(action => ({
      key: `project:${action.id}`,
      actionId: action.id,
      entity: project,
      context
    }));
}

function childCreateActions({ section = {}, actionManifest = [], project = null, parentType = 'project' } = {}) {
  return [...new Set(section.region?.actions || [])]
    .map(actionId => actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => (
      isCreateAction(action)
      && action.typeId === section.typeId
      && action.parentTypeId === parentType
      && actionAppliesToEntity(action, project, parentType)
    ))
    .map(action => ({
      key: `collection:${section.region?.id || section.typeId}:${action.id}`,
      actionId: action.id,
      entity: null,
      context: section.context || {}
    }));
}

function uniqueEntries(entries = [], actionManifest = []) {
  return [...new Map(entries.map(entry => {
    const action = actionManifest.find(candidate => candidate.id === entry.actionId);
    return [visibleOperationKey(action, entry), entry];
  })).values()];
}

function visibleOperationKey(action = {}, entry = {}) {
  if (!isCreateAction(action)) return entry.actionId;
  return ['createInstance', action.typeId || '', action.parentTypeId || ''].join(':');
}
