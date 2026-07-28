function parentEntityType(action = {}) {
  return action.parentEntityType
    || action.inputs?.find(input => input.id === 'parent')?.entityType
    || '';
}

function mutatedTopLevelBlock(input = {}) {
  const path = input.dataPath || input.path || '';
  return typeof path === 'string' ? path.split('.')[0] : '';
}

export function isProjectFileLauncherAction(action = {}) {
  if (action.actionKind === 'createEntity') {
    return parentEntityType(action) === 'project';
  }

  return (action.inputs || []).some(input => (
    input.kind === 'attachment'
    || ['attachments', 'relations'].includes(mutatedTopLevelBlock(input))
  ));
}
