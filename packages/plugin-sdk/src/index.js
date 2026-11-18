// @perigram/plugin-sdk barrel: the listing contract, both executor
// harnesses, and the platform API client. The CLI is the bin entry.
export { parseListing, normalizeListing } from './listing.js';
export { createEndpointExecutor } from './endpoint-executor.js';
export { runClaimExecutor } from './claim-executor.js';
export { createPluginClient } from './api-client.js';
export { checkSurfaceModule } from './surface-check.js';
export {
  normalizeNodeDefinition,
  validateNodeDefinition,
  assertValidNodeDefinition,
  createNodeProviderRegistry,
  normalizeNodeProvider,
  createPortCompatibilityRegistry
} from './node-contract.js';
