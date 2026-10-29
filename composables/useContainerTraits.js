import { computed, inject, onBeforeUnmount, onMounted, provide, ref, unref, watch } from 'vue';
import { resolveContainerTraits } from '#shared/ui-mapping/index.js';

const CONTAINER_KEY = 'uiMappingContainer';

// Container traits seam (shared/ui-mapping SPEC → Container traits): the
// one layout measurement path. Width is measured from the host element
// (the truth), height and scroll resolve from the host profile, density
// rides the screen's spacing coefficient.
function useMeasuredWidthRem(elRef) {
  const widthRem = ref(null);
  let observer = null;
  const remPx = () => parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const measure = () => {
    const el = unref(elRef);
    widthRem.value = el ? el.clientWidth / remPx() : null;
  };
  const observeCurrent = () => {
    observer?.disconnect();
    const el = unref(elRef);
    if (el) observer.observe(el);
    measure();
  };
  onMounted(() => {
    observer = new ResizeObserver(measure);
    observeCurrent();
  });
  // Dialog-hosted boxes mount when their overlay opens, after this
  // composable's host mounted: attach when the element appears.
  watch(elRef, () => observer && observeCurrent());
  onBeforeUnmount(() => observer?.disconnect());
  return widthRem;
}

export function useContainerTraits(elRef, { hostKind = 'page', density = null } = {}) {
  const widthRem = useMeasuredWidthRem(elRef);
  return computed(() => resolveContainerTraits({ widthRem: widthRem.value, hostKind, density }));
}

// A host declares its profile: measuring hosts (the pane, the page, the
// record popup) observe their own box; fixed-shape hosts provide the
// profile alone. Density stays unset so the profile's tier derives; a
// placement box passes its host's resolved density through.
export function provideContainerTraits({ hostKind, elRef = null, density = null } = {}) {
  const measured = elRef ? useContainerTraits(elRef, { hostKind, density }) : null;
  const traits = measured || computed(() => resolveContainerTraits({ hostKind, density }));
  provide(CONTAINER_KEY, traits);
  return traits;
}

// A placement box (a record side column, a peer-column track) measures
// where it renders: its own width is the truth, height/scroll/density
// inherit the host record it renders in.
export function providePlacementContainer(elRef) {
  const host = useHostContainerTraits();
  const widthRem = useMeasuredWidthRem(elRef);
  provide(CONTAINER_KEY, computed(() => resolveContainerTraits({
    widthRem: widthRem.value,
    height: host.value.height,
    scroll: host.value.scroll,
    density: host.value.density
  })));
}

// The routed surface's page profile is the providerless default: it
// provides only when no host (pane, dialog, popup) declared its record.
export function provideDefaultContainerTraits(options = {}) {
  if (inject(CONTAINER_KEY, null)) return;
  provideContainerTraits(options);
}

// Surfaces resolve the host record; the page profile is the providerless
// default (the routed surface renders at page width).
export function useHostContainerTraits() {
  const provided = inject(CONTAINER_KEY, null);
  return provided || computed(() => resolveContainerTraits({ hostKind: 'page' }));
}
