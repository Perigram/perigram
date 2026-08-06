export function resolveRelationOptionScope(creator = null) {
  if (!creator?.actionId) return { scoped: false, sourceInput: null };
  const fields = [
    ...(creator.inputPolicy?.fields || []),
    ...(creator.construction?.inputs || [])
  ];
  return {
    scoped: true,
    sourceInput: fields.find(field => field.type === 'entity' && field.entityType) || null
  };
}
