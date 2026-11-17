// Test/E2E seam for the facade plugin: the declarations that lived in
// @perigram/facade now live in the plugin listing
// (workers/facade/listing.json) — this helper shapes them for the specs
// and fixtures that seed registries, projections, and demo processes.
import listing from '../workers/facade/listing.json' with { type: 'json' };

export const facadeListing = listing;

export const facadeFileTypes = listing.declarations.types;

// Plugin-service species records for fixture domains: every listing
// service as a plugin-qualified record (the service is its command). The
// platform's palette law filters non-record-input services out of the
// real composition (server/features/plugins service.js, SPEC §20);
// fixtures that need the palette-exact shape apply the same predicate.
export const facadeServices = listing.declarations.services.map(service => ({
  id: `plugin.${listing.pluginId}.${service.id}`,
  species: 'service',
  command: `plugin.${listing.pluginId}.${service.id}`,
  palette: service.palette,
  signature: service.signature,
  render: service.render || { label: service.label || service.id }
}));

export const facadePackContent = {
  id: listing.pluginId,
  label: listing.name,
  types: listing.declarations.types,
  editors: listing.declarations.editors,
  services: facadeServices,
  attachmentKinds: listing.declarations.attachmentKinds
};

// The domain slice projections seed with: construction contracts from the
// listing's service-backed construction bindings; no commands or events
// (plugin value services carry none).
export const facadeDomain = {
  id: listing.pluginId,
  label: listing.name,
  commands: {},
  events: {},
  construction: Object.fromEntries(Object.entries(listing.declarations.constructions).map(([typeId, modes]) => [
    typeId,
    { modes: Object.keys(modes) }
  ])),
  serviceContracts: {}
};
