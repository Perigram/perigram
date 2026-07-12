import fs from 'fs/promises';
import path from 'path';

export const OCCS_LAYER_REGISTRY_PATH = path.resolve(
  process.cwd(),
  'docs/specs/Cassette spec/layers.json'
);

export const DEFAULT_PEN_BY_OCCS_GROUP = Object.freeze({
  contour: 'OCCS Contour Blue 0.35mm',
  cut: 'OCCS Cut Red 0.6mm',
  fold: 'OCCS Fold Amber Dashed 0.35mm',
  code: 'OCCS Code Green 0.35mm',
  dimension: 'OCCS Dimension Violet Dotted 0.25mm'
});

export const DEFAULT_PEN_BY_OCCS_LAYER_CODE = Object.freeze({
  'contour.prefix': 'OCCS Envelope Slate Dashed 0.25mm',
  'contour.cassette_face': 'OCCS Contour Blue 0.35mm',
  'contour.flat_pattern.face_and_returns': 'OCCS Flat Pattern Cyan 0.4mm',
  'contour.flat_pattern.offset_envelope': 'OCCS Envelope Slate Dashed 0.25mm',
  'contour.material_sheet': 'OCCS Flat Pattern Cyan 0.4mm',
  'contour.nesting_field': 'OCCS Envelope Slate Dashed 0.25mm',
  'cut.prefix': 'OCCS Envelope Slate Dashed 0.25mm',
  'cut.outer': 'OCCS Cut Red 0.6mm',
  'cut.inner': 'OCCS Cut Orange 0.45mm',
  'cut.hole': 'OCCS Cut Orange 0.45mm',
  'fold.prefix': 'OCCS Envelope Slate Dashed 0.25mm',
  'fold.route': 'OCCS Fold Amber Dashed 0.35mm',
  'fold.engrave': 'OCCS Engrave Indigo Dotted 0.25mm',
  'fold.reserved': 'OCCS Envelope Slate Dashed 0.25mm',
  'code.prefix': 'OCCS Envelope Slate Dashed 0.25mm',
  'code.cassette_mark': 'OCCS Code Green 0.35mm',
  'code.batch_number': 'OCCS Code Green 0.35mm',
  'code.paint_direction': 'OCCS Code Green 0.35mm',
  'dimension.prefix': 'OCCS Envelope Slate Dashed 0.25mm',
  'dimension.cassette': 'OCCS Dimension Violet Dotted 0.25mm',
  'dimension.material_sheet': 'OCCS Dimension Violet Dotted 0.25mm',
  'dimension.envelope': 'OCCS Dimension Violet Dotted 0.25mm'
});

const titleFromId = (id = '') => (
  id
    .split('.')
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1).replaceAll('_', ' ')}`)
    .join(' ')
);

export const parameterNames = (parameters) => {
  if (!parameters) return [];
  if (Array.isArray(parameters)) return parameters;
  return Object.keys(parameters);
};

export const penTemplateDtoId = (pen) => pen?.identity?.uid || pen?._id || null;

export const toLayerStandardSeed = (layer, registry = {}) => {
  const code = layer.id;
  const fallbackName = titleFromId(code);
  const dxfLayer = layer.defaultExport?.dxfLayer || layer.aliases?.[0] || code;

  return {
    code,
    name: fallbackName,
    category: String(layer.group || 'other').toUpperCase(),
    group: layer.group || null,
    kind: layer.kind || null,
    purpose: layer.purpose || null,
    production: Boolean(layer.production),
    allowedGeometry: Array.isArray(layer.allowedGeometry) ? layer.allowedGeometry : [],
    aliases: Array.isArray(layer.aliases) ? layer.aliases : [],
    defaultExport: layer.defaultExport || {},
    parameterSchema: layer.parameters || {},
    parameters: parameterNames(layer.parameters),
    description: layer.description || '',
    source: {
      registry: registry.occsLayerRegistry || null,
      registryId: registry.id || null
    },
    i18n: {
      en: { nameTemplate: fallbackName },
      ru: { nameTemplate: dxfLayer }
    },
    defaultPen: DEFAULT_PEN_BY_OCCS_LAYER_CODE[code]
      || DEFAULT_PEN_BY_OCCS_GROUP[layer.group]
      || 'OCCS Contour Blue 0.35mm'
  };
};

export const loadOccsLayerStandardSeeds = async (registryPath = OCCS_LAYER_REGISTRY_PATH) => {
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  return (registry.layers || []).map(layer => toLayerStandardSeed(layer, registry));
};
