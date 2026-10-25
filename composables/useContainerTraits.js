import { computed, inject, onBeforeUnmount, onMounted, provide, ref, unref } from 'vue';
import { resolveContainerTraits } from '#shared/ui-mapping/index.js';

const CONTAINER_KEY = 'uiMappingContainer';

// Container traits seam (shared/ui-mapping SPEC → Container traits): the
// one layout measurement path. Width is measured from the host element
// (the truth), height and scroll resolve from the host profile, density
// rides the screen's spacing coefficient.
export function useContainerTraits(elRef, { hostKind = 'page', density = 1 } = {}) {
  const widthRem = ref(null);
  let observer = null;
  const remPx = () => parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const measure = () => {
    const el = unref(elRef);
    widthRem.value = el ? el.clientWidth / remPx() : null;
  };
  onMounted(() => {
    measure();
    observer = new ResizeObserver(measure);
    const el = unref(elRef);
    if (el) observer.observe(el);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return computed(() => resolveContainerTraits({ widthRem: widthRem.value, hostKind, density }));
}

// A host declares its profile: measuring hosts (the pane) observe their
// own box; fixed-shape hosts (the popup) provide the profile alone.
export function provideContainerTraits({ hostKind, elRef = null, density = 1 } = {}) {
  const measured = elRef ? useContainerTraits(elRef, { hostKind, density }) : null;
  const traits = measured || computed(() => resolveContainerTraits({ hostKind, density }));
  provide(CONTAINER_KEY, traits);
  return traits;
}

// Surfaces resolve the host record; the page profile is the providerless
// default (the routed surface renders at page width).
export function useHostContainerTraits() {
  const provided = inject(CONTAINER_KEY, null);
  return provided || computed(() => resolveContainerTraits({ hostKind: 'page' }));
}
