<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <StandardPage v-else-if="screen && pageTitle" workspace :title="pageTitle" :back="back">
    <template #actions>
      <TypeDeclareEntry
        v-if="listDeclareTypeId"
        chrome="bare"
        :type-id="listDeclareTypeId"
      />
      <Button icon="pi pi-refresh" :label="$t('common.refresh')" severity="secondary" outlined size="small" :loading="poolLoading" @click="reload" />
    </template>
    <GeneratedScreenHost
      ref="host"
      :screen="screen"
      :screen-key="screenKey"
      :navigation="detailNavigation"
      @open-instance="openInstance"
    />
  </StandardPage>
  <template v-else-if="screen">
    <!-- Host chrome, never generated content (SPEC §1): the record
         surface's declaration affordance rides a page-owned header row
         above the detail surface, which owns its own record header. -->
    <TypeDeclareEntry
      v-if="detailDeclareTypeId"
      :type-id="detailDeclareTypeId"
    />
    <GeneratedScreenHost
      ref="host"
      :screen="screen"
      :screen-key="screenKey"
      :navigation="detailNavigation"
      @open-instance="openInstance"
    />
  </template>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import TypeDeclareEntry from '~/components/generated/TypeDeclareEntry.vue';
import { synthesizeDetailScreen } from '~/components/generated/detail-screen-actions.js';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { usePageBack } from '~/composables/usePageBack.js';
import { resolveDefaultHomeScreen, screenByKey } from '~/utils/process-navigation.js';
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

// Every compiled screen renders through the generator host: generator
// templates directly, the home template as the host's overload branch.
// The routed surface keeps the route title strip (with the back control);
// detail, form, and home surfaces own their headers, and every
// collection region carries its own title bar (SPEC §22.3).
const GENERATOR_TEMPLATES = ['typeList', 'instanceDetail', 'formAction'];
const pageTitle = computed(() => (
  ['instanceDetail', 'formAction', 'home'].includes(screen.value?.template)
    ? null
    : screen.value?.label || screen.value?.screenKey
));

// The declaration affordance for routed typeList surfaces (SPEC §1): the
// page's action space hosts it beside refresh, exactly like the pane
// header does for the workspace twin.
const listDeclareTypeId = computed(() => (
  screen.value?.template === 'typeList' ? String(screen.value.typeId || '') : ''
));

// The record surface's twin: the detail branch owns no page title, so the
// affordance rides a page-owned header row above the detail surface.
const detailDeclareTypeId = computed(() => (
  screen.value?.template === 'instanceDetail' ? String(screen.value.typeId || '') : ''
));

const screen = computed(() => {
  const base = screenByKey(authStore.screenManifest, screenKey.value)
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
// A stale /screens/home* URL replaces to /home instead of rendering a
// second home surface; system screens (organization overview/account,
// route records) own their own routes and replace there.
watch(() => [screen.value?.template, screen.value?.route], ([template, screenRoute]) => {
  if (!process.client || !template) return;
  if (template === 'home' && route.path !== HOME_SCREEN_ROUTE) {
    navigateTo(HOME_SCREEN_ROUTE, { replace: true });
    return;
  }
  if (!GENERATOR_TEMPLATES.includes(template) && template !== 'home') {
    navigateTo(screenRoute || HOME_SCREEN_ROUTE, { replace: true });
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

// The synthesized fallback speaks the compiled UI contract vocabulary
// (instanceDetail + typeId) from the type's list screen, exactly like
// the workspace's detail-screen synthesizer.
function synthesizedDetailScreen(key = '') {
  if (!String(key).endsWith('_detail')) return null;
  const baseKey = String(key).slice(0, -'_detail'.length);
  const base = screenByKey(authStore.screenManifest, baseKey);
  return base ? synthesizeDetailScreen(base) : null;
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
