import GeneratedHomeWorkspace from '~/components/generated/GeneratedHomeWorkspace.vue';

// Screen overloads: templates whose surface a registered component owns
// outright. Detail surfaces render through the ui-mapping generator;
// editors are workspace pages registered through the file-surface
// registry.
export const generatedScreenOverloads = [
  {
    template: 'home',
    component: GeneratedHomeWorkspace
  }
];

export function resolveGeneratedScreenOverload(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return null;
  return generatedScreenOverloads.find(overload => (
    overload.template === screen.template
    && (overload.typeId == null || overload.typeId === detailScreenTypeId(screen))
  )) || null;
}

function detailScreenTypeId(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return '';
  if (screen.typeId) return screen.typeId;
  const singleSource = (screen.sources || []).find(source => source.mode === 'single');
  return singleSource?.typeId || '';
}
