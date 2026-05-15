export function createReadOnlyToolHandlers({
  listEntities,
  getEntity,
  getWorkflow,
  validateArchitecture,
  listRoutes = () => [],
  queryDocs = () => [],
  validateTransition = () => ({ ok: false, reason: 'validator_missing' })
}) {
  return {
    list_entities: async () => listEntities(),
    get_entity_schema: async ({ type }) => getEntity(type),
    get_workflow: async ({ type }) => getWorkflow(type),
    list_routes: async () => listRoutes(),
    query_docs: async ({ query }) => queryDocs(query),
    simulate_transition: async ({ type, currentState, targetState, role }) => {
      const workflow = await getWorkflow(type);
      return validateTransition({ workflow, currentState, targetState, role });
    },
    validate_architecture: async () => validateArchitecture()
  };
}
