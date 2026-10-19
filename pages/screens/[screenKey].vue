<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <GeneratedScreen v-else-if="screen && !isGeneratedScreen" :screen="screen" :back="back" />
  <StandardPage v-else-if="screen" workspace :title="pageTitle" :back="pageTitle ? back : null">
    <template #actions>
      <Button v-if="pageTitle" icon="pi pi-refresh" :label="$t('common.refresh')" severity="secondary" outlined size="small" :loading="poolLoading" @click="reload" />
    </template>
    <GeneratedScreenHost
      ref="host"
      :screen="screen"
      :screen-key="screenKey"
      :navigation="detailNavigation"
      @open-instance="openInstance"
    />
  </StandardPage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { usePageBack } from '~/composables/usePageBack.js';
import { resolveDefaultHomeScreen } from '~/utils/process-navigation.js';
import { HOME_SCREEN_ROUTE } from '~/packages/processes/src/screen-contract.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
// The auth middleware has already hydrated this store for SSR and client route
// navigation. Re-fetching it on mount replaces the manifest and unmounts the
// generated workspace immediately after hydration.
const refreshingAuth = ref(!authStore.userIsSet);

// The routed surface owns the back affordance (in-app history with the
// home ladder fallback — usePageBack): the page header for list screens,
// the record header's navigation channel for detail screens.
const { navigation: back } = usePageBack();
const detailNavigation = computed(() => (
  screen.value?.template === 'instanceDetail' ? back.value : null
));

const screenKey = computed(() => Array.isArray(route.params.screenKey)
  ? route.params.screenKey.join('/')
  : route.params.screenKey
);

// Process screens arrive in the compiled UI contract vocabulary
// (typeList/instanceDetail/home + typeId) and render through the
// generator host; workspace overloads (the home shell) and the system
// screen templates stay on the legacy renderer, which owns their
// surfaces, until the generator grows workspace equivalents.
const isGeneratedScreen = computed(() => (
  screen.value?.template === 'typeList'
  || screen.value?.template === 'instanceDetail'
));
// The routed detail's record header owns the page: the type label and
// back affordance render once, through the record header's anatomy and
// navigation channel. List screens keep the route title strip.
const pageTitle = computed(() => (
  screen.value?.template === 'instanceDetail'
    ? null
    : screen.value?.label || screen.value?.screenKey
));

const screen = computed(() => {
  const base = authStore.screenManifest.find(item => item.screenKey === screenKey.value)
    || synthesizedDetailScreen(screenKey.value)
    // Home is the default screen: an unresolvable key (no active
    // definition, one that no longer compiles, a stale bookmark) renders
    // the home workspace instead of an error surface.
    || resolveDefaultHomeScreen(authStore.screenManifest);
  return {
    ...base,
    scope: {
      ...(base.scope || {}),
      ...scopeFromQuery(route.query)
    }
  };
});
// Home serves at the stable shell route; a stale /screens/home* URL
// replaces to it instead of rendering a second home surface.
watch(() => screen.value?.template, template => {
  if (template === 'home' && process.client && route.path !== HOME_SCREEN_ROUTE) {
    navigateTo(HOME_SCREEN_ROUTE, { replace: true });
  }
}, { immediate: true });

// The host owns pool hydration, per-source data states, and action runs;
// the page keeps the refresh control's loading state.
const host = ref(null);
const poolLoading = ref(false);
async function reload() {
  if (!host.value?.reload) return;
  poolLoading.value = true;
  try {
    await host.value.reload();
  } finally {
    poolLoading.value = false;
  }
}

// Collection identity navigation on the routed surface: the compiler-
// paired detail screen with the instance id in the route scope. Types
// without a paired detail screen stay non-navigable.
function openInstance({ typeId, instanceId } = {}) {
  const detailKey = `auto_${typeId}_detail`;
  const exists = authStore.screenManifest.some(item => item.screenKey === detailKey);
  if (!typeId || !instanceId || !exists) return;
  navigateTo({ path: `/screens/${encodeURIComponent(detailKey)}`, query: { instanceId } });
}

function synthesizedDetailScreen(key = '') {
  if (!String(key).endsWith('_detail')) return null;
  const baseKey = String(key).slice(0, -'_detail'.length);
  const base = authStore.screenManifest.find(item => item.screenKey === baseKey);
  const typeId = base?.typeId;
  if (!base || !typeId) return null;
  const sourceId = base.sources?.[0]?.id || typeId;
  const required = base.required || base.sources?.[0]?.required || null;
  // The synthesized fallback speaks the compiled UI contract vocabulary
  // (instanceDetail + typeId) so it renders through the generator like the
  // compiler-paired detail screens it stands in for.
  return {
    ...base,
    id: `${base.id || baseKey}_detail`,
    screenKey: key,
    route: `/screens/${encodeURIComponent(key)}`,
    template: 'instanceDetail',
    placement: 'detail',
    sources: [{
      id: sourceId,
      typeId,
      mode: 'single',
      required,
      identifier: '$screen.scope.instanceId'
    }],
    regions: [{
      id: 'main',
      slot: 'main',
      sourceId,
      surface: 'detail',
      actions: base.actions || []
    }],
    actions: base.actions || []
  };
}

function scopeFromQuery(query = {}) {
  const scope = Object.fromEntries(Object.entries(query)
    .filter(([key]) => key === 'instanceId' || key.endsWith('Id'))
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
  // The generator resolves single sources through scope.instanceId.
  return scope;
}
</script>
