import GeneratedHomeWorkspace from '~/components/generated/GeneratedHomeWorkspace.vue';
import ArtifactDetail from '~/components/entities/Artifact/ArtifactDetail.vue';
import { fileDetailOverloads } from '~/components/generated/file-surfaces.js';

// File-type detail bodies (cassette, sheet-design, facade-design,
// facade-pattern, sketch) derive from the pack editor bindings through
// the file-surface registry — the type id is the projected entity key.
// The artifact row stays static: artifacts are the framework file
// service (SPEC §13), not a pack type.
export const generatedScreenOverloads = [
  {
    template: 'home',
    component: GeneratedHomeWorkspace
  }
];

export const generatedEntityDetailOverloads = [
  {
    typeId: 'artifact',
    component: ArtifactDetail,
    props: ({ entity }) => ({ artifact: entity })
  },
  ...fileDetailOverloads()
];

export function resolveGeneratedScreenOverload(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return null;
  return generatedScreenOverloads.find(overload => (
    overload.template === screen.template
    && (overload.typeId == null || overload.typeId === detailScreenTypeId(screen))
  )) || null;
}

export function resolveGeneratedInstanceDetailOverload(typeId = '') {
  return generatedEntityDetailOverloads.find(overload => overload.typeId === typeId) || null;
}

function detailScreenTypeId(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return '';
  if (screen.typeId) return screen.typeId;
  const singleSource = (screen.sources || []).find(source => source.mode === 'single');
  return singleSource?.typeId || '';
}
