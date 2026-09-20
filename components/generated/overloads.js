import GeneratedHomeWorkspace from '~/components/generated/GeneratedHomeWorkspace.vue';
import GeneratedProjectWorkspace from '~/components/generated/GeneratedProjectWorkspace.vue';
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
  },
  {
    template: 'entityDetail',
    entityType: 'project',
    component: GeneratedProjectWorkspace
  }
];

export const generatedEntityDetailOverloads = [
  {
    entityType: 'artifact',
    component: ArtifactDetail,
    props: ({ entity }) => ({ artifact: entity })
  },
  ...fileDetailOverloads()
];

export function resolveGeneratedScreenOverload(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return null;
  return generatedScreenOverloads.find(overload => (
    overload.template === screen.template
    && (overload.entityType == null || overload.entityType === detailEntityType(screen))
  )) || null;
}

export function resolveGeneratedEntityDetailOverload(entityType = '') {
  return generatedEntityDetailOverloads.find(overload => overload.entityType === entityType) || null;
}

function detailEntityType(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return '';
  if (screen.entityType) return screen.entityType;
  const singleSource = (screen.sources || []).find(source => source.mode === 'single');
  return singleSource?.entityType || '';
}
