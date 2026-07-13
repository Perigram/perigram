export const occsParameterSource = (definition = {}) => {
  if (definition?.params && typeof definition.params === 'object' && !Array.isArray(definition.params)) {
    return definition.params;
  }
  if (definition?.parameters && typeof definition.parameters === 'object' && !Array.isArray(definition.parameters)) {
    return definition.parameters;
  }
  return {};
};

export const occsParameterNames = (definition = {}) => Object.keys(occsParameterSource(definition));

export const occsQueueParameterValue = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : value;
};

export const occsQueueParameters = (definition = {}) => (
  Object.fromEntries(Object.entries(occsParameterSource(definition))
    .map(([key, value]) => [key, occsQueueParameterValue(value)]))
);

export const occsParametersWithMaterialThickness = (parameters = {}, thickness = 0) => ({
  ...(parameters || {}),
  ...(Number(thickness) > 0 ? { [OCCS_MATERIAL_THICKNESS_PARAMETER]: Number(thickness) } : {})
});

export const isOccsDocument = (definition = {}) => Boolean(definition?.occs && definition?.documentType);
export const OCCS_MATERIAL_THICKNESS_PARAMETER = 'T';
