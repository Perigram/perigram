export function createReadOnlyToolHandlers({
  listEntities,
  getEntity,
  getWorkflow,
  validateArchitecture,
  getFrameworkManifest = () => null,
  listRoutes = () => [],
  listUiComponents = () => [],
  listUiPrimitives = () => [],
  listDesignTokens = () => ({}),
  listRelationships = () => [],
  listSummaries = () => [],
  validateUiContracts = () => ({ ok: true, issues: [] }),
  queryDocs = () => [],
  validateTransition = () => ({ ok: false, reason: 'validator_missing' })
}) {
  return {
    list_entities: async () => listEntities(),
    get_entity_schema: async ({ type }) => getEntity(type),
    get_workflow: async ({ type }) => getWorkflow(type),
    get_framework_manifest: async () => getFrameworkManifest(),
    list_routes: async () => listRoutes(),
    list_ui_components: async () => listUiComponents(),
    list_ui_primitives: async () => listUiPrimitives(),
    list_design_tokens: async () => listDesignTokens(),
    list_relationships: async () => listRelationships(),
    list_summaries: async () => listSummaries(),
    validate_ui_contracts: async () => validateUiContracts(),
    query_docs: async ({ query }) => queryDocs(query),
    simulate_transition: async ({ type, currentState, targetState, role }) => {
      const workflow = await getWorkflow(type);
      return validateTransition({ workflow, currentState, targetState, role });
    },
    validate_architecture: async () => validateArchitecture()
  };
}
