export function createReadOnlyToolHandlers({ listEntities, getEntity, getWorkflow, validateArchitecture, validateTransition = () => ({ ok: false, reason: 'validator_missing' }) }) {
  return {
    list_entities: async () => listEntities(),
    get_entity_schema: async ({ type }) => getEntity(type),
    get_workflow: async ({ type }) => getWorkflow(type),
    simulate_transition: async ({ type, currentState, targetState, role }) => {
      const workflow = await getWorkflow(type);
      return validateTransition({ workflow, currentState, targetState, role });
    },
    validate_architecture: async () => validateArchitecture()
  };
}
