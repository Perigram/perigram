import GeneratedHomeWorkspace from '~/components/generated/GeneratedHomeWorkspace.vue';
import ArtifactDetail from '~/components/entities/Artifact/ArtifactDetail.vue';

// The artifact detail overload: artifacts are the framework file service
// (SPEC §13) with their own read/manage detail surface. Editors are NOT
// detail overloads — they register workspace pages through the
// file-surface registry and open as pane tabs.
export const generatedScreenOverloads = [
  {
    template: 'home',
    component: GeneratedHomeWorkspace
  }
];

export const generatedInstanceDetailOverloads = [
  {
    typeId: 'artifact',
    component: ArtifactDetail,
    props: ({ entity }) => ({ artifact: entity })
  }
];

export function resolveGeneratedScreenOverload(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return null;
  return generatedScreenOverloads.find(overload => (
    overload.template === screen.template
    && (overload.typeId == null || overload.typeId === detailScreenTypeId(screen))
  )) || null;
}

export function resolveGeneratedInstanceDetailOverload(typeId = '') {
  return generatedInstanceDetailOverloads.find(overload => overload.typeId === typeId) || null;
}

function detailScreenTypeId(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return '';
  if (screen.typeId) return screen.typeId;
  const singleSource = (screen.sources || []).find(source => source.mode === 'single');
  return singleSource?.typeId || '';
}
