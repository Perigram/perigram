import { computed, onMounted, ref, toValue } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { resolveProcessEntryRoute } from '~/utils/process-navigation.js';

// Routed-surface back affordance: follows in-app history when the
// previous entry is an app route (vue-router records it in history
// state), and falls back to the process entry route — the home ladder —
// so a deep link never dead-ends. The affordance turns on client-side
// only: it reads window.history, and an SSR/client difference would
// hydration-mismatch whatever header renders it. `when` gates surfaces
// that are mounted both as routes and as pane tabs (the organization
// pages): the back control belongs to the routed surface, never the pane.
export function usePageBack({ when = true } = {}) {
  const route = useRoute();
  const router = useRouter();
  const authStore = useAuthStore();
  const { t } = useI18n();
  const mounted = ref(false);
  onMounted(() => { mounted.value = true; });

  function goBack() {
    const back = window.history?.state?.back;
    if (typeof back === 'string' && back.startsWith('/') && back !== route.fullPath) {
      router.back();
      return;
    }
    router.push(resolveProcessEntryRoute({
      screens: authStore.screenManifest,
      navigation: authStore.navigationManifest
    }));
  }

  // The shared `{ icon, label, command }` shape: StandardPage's back
  // control and SurfaceHeader's navigation channel render it alike.
  const navigation = computed(() => (mounted.value && toValue(when)
    ? { icon: 'pi pi-arrow-left', label: t('common.back'), command: goBack }
    : null));

  return { navigation };
}
