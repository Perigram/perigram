// Shared service-declaration predicates: transport mode and graph
// wireability. Both the plugin feature and the served graph-node catalog
// read these rules.

export function serviceModeOf(service = {}) {
  // An explicit transport mode is authoritative. Some listing compilers
  // attach execution metadata for shared/browser-server implementations;
  // that metadata must not hide a declared remote endpoint from plugin
  // settings (or from the provider-level executor-origin configuration).
  if (service.mode === 'endpoint') return 'endpoint';
  if (service.mode === 'local') return 'local';
  if (service.execution) return 'managed';
  return 'claim';
}

// Palette law (SPEC §20): only a service with a record signature input
// projects data sockets, so it is the only kind that can be wired in a
// graph. Bare-value services stay implementation executors.
export function isWireableValueService(service = {}) {
  const input = service.signature?.input;
  return !input || input.base === 'record';
}
