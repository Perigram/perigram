// Design-system surface chrome vocabulary and the per-entry chrome
// contracts the UI lab manifest validates. Live-type audit (2026-09):
// this module consults no field-group table and pins no per-key
// synthesized group lists — which groups a surface shows is class-level
// generic policy at resolve time in `utils/instance-display-contract.js`.
// Preview chrome survives only for the artifact family (Phase 7 cuts it
// later); everything else previewed through here rendered retired types.
export const CNC_SURFACES = ['inline', 'compact', 'card', 'detail', 'table', 'picker', 'workspace'];
export const CNC_PREVIEW_MODES = ['none', 'icon', 'thumbnail', 'hero', 'canvas', 'attachment'];
export const CNC_DATA_DISPLAYS = ['inline', 'compact', 'grid', 'sectioned', 'table', 'custom'];
export const CNC_RELATION_DISPLAYS = ['none', 'inlineRefs', 'summary', 'expanded'];
export const CNC_ACTION_DISPLAYS = ['none', 'menu', 'footer', 'toolbar', 'primaryOnly'];

const previewFor = (key) => (key === 'artifact' ? 'attachment' : 'none');

export function createEntitySurfaceContracts(entityContracts = []) {
  return Object.fromEntries(entityContracts.map((entry) => {
    const key = entry.key;
    const preview = previewFor(key);
    return [key, {
      key,
      typeId: entry.typeId,
      status: entry.status,
      trace: entry.trace,
      surfaces: {
        inline: {
          preview: 'none',
          fieldGroups: [],
          fieldLimit: 1,
          dataDisplay: 'inline',
          relations: 'none',
          actions: 'none',
          status: entry.status === 'interactive' ? 'readonly' : 'hidden',
          trace: 'hidden'
        },
        compact: {
          preview: preview === 'hero' ? 'thumbnail' : preview,
          fieldGroups: [],
          fieldLimit: 3,
          dataDisplay: 'compact',
          relations: 'summary',
          actions: 'menu',
          status: entry.status,
          trace: 'hidden'
        },
        card: {
          preview: preview === 'canvas' ? 'hero' : preview,
          fieldGroups: [],
          dataDisplay: 'grid',
          relations: 'inlineRefs',
          actions: 'footer',
          status: entry.status,
          trace: 'hidden'
        },
        detail: {
          preview: preview === 'none' ? 'none' : 'hero',
          fieldGroups: [],
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
