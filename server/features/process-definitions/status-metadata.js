function processStatusMetadata(action = {}, note = '', processData = {}) {
  const display = actionStatusDisplayMetadata(action, processData);
  return {
    note,
    ...(action.producerOutputId ? { producerOutputId: action.producerOutputId } : {}),
    ...(display ? { display } : {})
  };
}

function processTransitionContext(action = {}, data = {}, processData = {}) {
  const source = data?.stateMeta || data?.context || {};
  const display = actionStatusDisplayMetadata(action, processData);
  if (!display) return source;
  if (source?.metadata || source?.lifecycle) {
    return {
      ...source,
      metadata: {
        ...(source.metadata || {}),
        display
      }
    };
  }
  return {
    ...source,
    display
  };
}

function actionStatusDisplayMetadata(action = {}, processData = {}) {
  return statusDisplayMetadata({
    ...stateDefinitionForAction(action, processData),
    ...(action.state || {})
  });
}

function stateDefinitionForAction(action = {}, processData = {}) {
  const stateRef = action.stateRef;
  if (stateRef && processData?.stateDefinitions?.[stateRef]) return processData.stateDefinitions[stateRef];
  const target = action.state?.to || action.access?.stateTo;
  if (!target) return {};
  return Object.values(processData?.stateDefinitions || {}).find(definition => (
    definition?.stateId === target || definition?.id === target
  )) || {};
}

function statusDisplayMetadata(status = {}) {
  const display = {
    ...(status.label ? { label: status.label } : {}),
    ...(status.color || status.severity ? { color: status.color || status.severity } : {}),
    ...(status.severity || status.color ? { severity: status.severity || status.color } : {}),
    ...(status.icon ? { icon: status.icon } : {})
  };
  return Object.keys(display).length ? display : null;
}
