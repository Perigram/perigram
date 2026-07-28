export function queueEntryParameterNames(entry = {}, sourceParameterNames = []) {
  const parameters = entry.parameters || entry.dimensions || {};
  return Array.from(new Set([
    ...(Array.isArray(sourceParameterNames) ? sourceParameterNames : []),
    ...Object.keys(parameters)
  ].filter(name => typeof name === 'string' && name.length > 0)));
}
