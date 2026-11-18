// Facade-owned adapter: project baked OCCS geometry into the generic
// polygon-part contract consumed by the independent Nesting plugin.

export function nestingPartsProjection(geometry = null) {
  const parts = Array.isArray(geometry?.nestingPolygons) ? geometry.nestingPolygons : [];
  const layerData = Array.isArray(geometry?.layerData) ? geometry.layerData : [];
  return parts.map(part => ({
    ...part,
    sourceLayers: layerData.filter(layer => (
      !layer.workpieceId ||
      !part.workpieceId ||
      layer.workpieceId === part.workpieceId
    ))
  }));
}

export function stableSheetName(layout = null, draft = {}) {
  const authored = String(draft?.data?.name || '').trim();
  if (authored) return authored;
  const identity = String(layout?.compositionKey || JSON.stringify(layout || {}));
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `Sheet ${(hash >>> 0).toString(36)}`;
}
