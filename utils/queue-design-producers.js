function featureForEntity(domain = {}, entityType = '') {
  return (domain.entities || []).find(entity => entity.type === entityType)?.collection || `${entityType}s`;
}

function actionConstructionMode(action = {}) {
  return action.construction?.mode || action.constructionMode || '';
}

function canReadFeature(hasFeatureAccess, feature) {
  return Boolean(feature && hasFeatureAccess(feature, 'read'));
}

function directProducerAvailable(producer = {}, { canEditQueue = false, hasFeatureAccess = () => false, domain = {} } = {}) {
  if (!canEditQueue) return false;
  const sourceEntityType = producer.source?.entityType || producer.output?.entityType || '';
  const sourceFeature = featureForEntity(domain, sourceEntityType);
  if (producer.kind === 'entitySource') return canReadFeature(hasFeatureAccess, sourceFeature);
  if (producer.constructionMode === 'importCassetteDesignFromArtifact') {
    return hasFeatureAccess(featureForEntity(domain, 'artifact'), 'write')
      && hasFeatureAccess(featureForEntity(domain, 'cassette_design'), 'write');
  }
  if (producer.constructionMode === 'bakeCassetteDesignFromTemplate') {
    return canReadFeature(hasFeatureAccess, sourceFeature)
      && hasFeatureAccess(featureForEntity(domain, 'cassette_design'), 'write');
  }
  return true;
}

export function resolveQueueDesignProducers({
  domain = {},
  processMode = false,
  processActions = [],
  canEditQueue = false,
  hasFeatureAccess = () => false,
  outputEntityType = 'cassette_design'
} = {}) {
  const domainProducers = (domain.producers || [])
    .filter(producer => producer.output?.entityType === outputEntityType);
  const actionByConstructionMode = new Map(
    processActions
      .filter(action => action?.contracts?.outputs?.some(output => (typeof output === 'string' ? output : output?.entityType) === outputEntityType))
      .map(action => [actionConstructionMode(action), action])
      .filter(([mode]) => mode)
  );
  const boundConstructionModes = new Set();

  const resolved = domainProducers
    .map(producer => {
      if (!processMode) {
        return directProducerAvailable(producer, { canEditQueue, hasFeatureAccess, domain })
          ? { ...producer, sourceKind: 'domainProducer' }
          : null;
      }
      if (producer.kind === 'entitySource') {
        const sourceFeature = featureForEntity(domain, producer.source?.entityType || producer.output?.entityType);
        return canReadFeature(hasFeatureAccess, sourceFeature)
          ? { ...producer, sourceKind: 'domainProducer' }
          : null;
      }
      const action = actionByConstructionMode.get(producer.constructionMode);
      if (!action) return null;
      boundConstructionModes.add(producer.constructionMode);
      return {
        ...producer,
        sourceKind: 'processAction',
        actionId: action.actionId || action.id,
        action
      };
    })
    .filter(Boolean);

  const extraActions = processMode
    ? processActions
      .filter(action => action?.contracts?.outputs?.some(output => (typeof output === 'string' ? output : output?.entityType) === outputEntityType))
      .filter(action => {
        const mode = actionConstructionMode(action);
        return !mode || !boundConstructionModes.has(mode);
      })
      .map(action => ({
        id: action.actionId || action.id,
        actionId: action.actionId || action.id,
        label: action.label || action.actionId || action.id,
        kind: 'processAction',
        sourceKind: 'processAction',
        constructionMode: actionConstructionMode(action),
        action,
        output: { entityType: outputEntityType }
      }))
    : [];

  return [...resolved, ...extraActions];
}
