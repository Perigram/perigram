import { computed, onBeforeUnmount, onMounted, ref, unref } from 'vue';
import { resolveContainerTraits } from '#shared/ui-mapping/index.js';

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
