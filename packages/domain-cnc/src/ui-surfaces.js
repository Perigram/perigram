import { cncEntityFieldGroups } from './ui-fields.js';

export const CNC_SURFACES = ['inline', 'compact', 'card', 'detail', 'table', 'picker', 'workspace'];
export const CNC_PREVIEW_MODES = ['none', 'icon', 'thumbnail', 'hero', 'canvas', 'attachment'];
export const CNC_DATA_DISPLAYS = ['inline', 'compact', 'grid', 'sectioned', 'table', 'custom'];
export const CNC_RELATION_DISPLAYS = ['none', 'inlineRefs', 'summary', 'expanded'];
export const CNC_ACTION_DISPLAYS = ['none', 'menu', 'footer', 'toolbar', 'primaryOnly'];

const defaultFieldGroupsFor = (key) => {
  const groups = cncEntityFieldGroups[key] || {};
  if (groups.summary) return ['summary'];
  if (groups.stock) return ['stock'];
  if (groups.specs) return ['specs'];
  if (groups.relations) return ['relations'];
  return [];
};

const previewFor = (key) => {
  if (['cassette', 'cassetteTemplate', 'cassetteDesign', 'cassetteInstance'].includes(key)) return 'thumbnail';
  if (['sheetDesign', 'remnant', 'geometryCapture'].includes(key)) return 'canvas';
  if (key === 'artifact') return 'attachment';
  return 'none';
};

const cardGroupsFor = (key) => {
  const groups = cncEntityFieldGroups[key] || {};
  const orderedGroups = ['summary', 'specs', 'stock', 'geometry', 'relations', 'provenance'];
  return orderedGroups
    .filter(group => groups[group]);
};

const detailGroupsFor = (key) => {
  const groups = cncEntityFieldGroups[key] || {};
  return ['identity', 'summary', 'specs', 'stock', 'geometry', 'production', 'relations', 'provenance']
    .filter(group => groups[group]);
};

export function createEntitySurfaceContracts(entityContracts = []) {
  return Object.fromEntries(entityContracts.map((entry) => {
    const key = entry.key;
    const preview = previewFor(key);
    const compactGroups = defaultFieldGroupsFor(key);
    return [key, {
      key,
      entityType: entry.entityType,
      status: entry.status,
      trace: entry.trace,
      surfaces: {
        inline: {
          preview: 'none',
          fieldGroups: compactGroups,
          fieldLimit: 1,
          dataDisplay: 'inline',
          relations: 'none',
          actions: 'none',
          status: entry.status === 'interactive' ? 'readonly' : 'hidden',
          trace: 'hidden'
        },
        compact: {
          preview: preview === 'hero' ? 'thumbnail' : preview,
          fieldGroups: compactGroups,
          fieldLimit: 3,
          dataDisplay: 'compact',
          relations: 'summary',
          actions: 'menu',
          status: entry.status,
          trace: 'hidden'
        },
        card: {
          preview: preview === 'canvas' ? 'hero' : preview,
          fieldGroups: cardGroupsFor(key),
          dataDisplay: 'grid',
          relations: 'inlineRefs',
          actions: 'footer',
          status: entry.status,
          trace: 'hidden'
        },
        detail: {
          preview: preview === 'none' ? 'none' : 'hero',
          fieldGroups: detailGroupsFor(key),
          dataDisplay: 'sectioned',
          relations: 'expanded',
          actions: 'toolbar',
          status: entry.status,
          trace: entry.trace ? 'full' : 'hidden'
        }
      }
    }];
  }));
}

export function getEntitySurfaceContract(surfaceContracts, entityKey) {
  return surfaceContracts?.[entityKey] || null;
}
