import { generatedRegionLabel } from './generated-labels.js';

// The workspace's collection sources: the home screen's list regions, the
// same set the home workspace and the instance tree render as sections.
export function homeCollectionSections(homeScreen = null, { t, te } = {}) {
  if (!homeScreen) return [];
  return (homeScreen.regions || [])
    .map(region => {
      const source = (homeScreen.sources || []).find(candidate => candidate.id === region.sourceId) || {};
      if (!source.typeId || source.mode === 'single') return null;
      const parentBound = (source.lineageBindings || [])
        .some(binding => binding.childTypeId === source.typeId
          && binding.parentTypeId !== 'organization');
      if (parentBound) return null;
      return { region, source, label: generatedRegionLabel(region, source, { t, te }) };
    })
    .filter(Boolean);
}
