import { actionProducesEntityType } from '~/utils/queue-producers.js';

const detailActionConsumers = {
  cassette: action => action?.actionKind === 'updateEntity',
  queue: action => (
    (action?.actionKind === 'runCommand' && action.commandId === 'solveNesting')
    || actionProducesEntityType(action, 'cassette_design')
  ),
  sheet_design: action => action?.actionKind === 'updateEntity'
};

export function generatedEntityDetailConsumesAction(entityType = '', action = {}) {
  return Boolean(detailActionConsumers[entityType]?.(action));
}
