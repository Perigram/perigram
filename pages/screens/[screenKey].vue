<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <GeneratedScreen v-else-if="screen && !isGeneratedScreen" :screen="legacyViewScreen" />
  <StandardPage v-else-if="screen" workspace>
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('common.refresh')" severity="secondary" outlined size="small" :loading="poolLoading" @click="reload" />
    </template>
    <Message v-if="poolError" severity="error" :closable="false">{{ poolError }}</Message>
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-section-heading">{{ screen.label || screen.screenKey }}</span>
        <Tag v-if="screen.typeId" :value="screen.typeId" severity="secondary" />
        <Tag :value="screen.template" severity="info" />
      </div>
      <GeneratedMappingScreen
        :screen="screen"
        :contract="{ actions: processActions }"
        :bundle="processBundle"
        :instances="pool"
        :on-run="runGeneratedAction"
      />
    </div>
  </StandardPage>
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { useAuthStore } from '~/stores/auth';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useScreenInstancePool } from '~/composables/useScreenInstancePool.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { resolveGeneratedEntityDetailOverload } from '~/components/generated/overloads.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const toast = useToast();
const { t } = useI18n();
const authStore = useAuthStore();
// The auth middleware has already hydrated this store for SSR and client route
// navigation. Re-fetching it on mount replaces the manifest and unmounts the
// generated workspace immediately after hydration.
const refreshingAuth = ref(!authStore.userIsSet);

const screenKey = computed(() => Array.isArray(route.params.screenKey)
  ? route.params.screenKey.join('/')
  : route.params.screenKey
);

// Process screens arrive in the compiled UI contract vocabulary
// (typeList/instanceDetail/home + typeId) and render through the generator.
// Workspace overloads (the home shell and editor-backed detail types:
// project/cassette/facade/queue/artifact...) stay on the legacy renderer,
// which owns their data loader and action surface, until the generator
// grows workspace equivalents.
const detailOverload = computed(() => (
  screen.value?.template === 'instanceDetail' && screen.value?.typeId
    ? resolveGeneratedEntityDetailOverload(screen.value.typeId)
    : null
));
const isGeneratedScreen = computed(() => (
  screen.value?.template === 'typeList'
  || (screen.value?.template === 'instanceDetail' && !detailOverload.value)
));
// View adapter for the not-yet-migrated workspace overloads: the legacy
// renderer still speaks its own template/entity names. This dies with the
// workspace migration; the compiled contract itself stays single-vocabulary.
const legacyViewScreen = computed(() => {
  if (isGeneratedScreen.value || !screen.value) return screen.value;
  const view = {
    ...screen.value,
    template: screen.value.template === 'instanceDetail' ? 'entityDetail' : screen.value.template,
    entityType: screen.value.typeId || screen.value.entityType || null,
    sources: (screen.value.sources || []).map(source => ({ ...source, entityType: source.typeId || source.entityType || null }))
  };
  return view;
});
const screen = computed(() => {
  const base = authStore.screenManifest.find(item => item.screenKey === screenKey.value)
    || synthesizedDetailScreen(screenKey.value);
  if (!base) return null;
  return {
    ...base,
    scope: {
      ...(base.scope || {}),
      ...scopeFromQuery(route.query)
    }
  };
});
const processBundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const processActions = computed(() => authStore.processPayload?.actions || {});

const { pool, loading: poolLoading, error: poolError, load: loadPool } = useScreenInstancePool();
async function reload() {
  if (screen.value) await loadPool(screen.value, processBundle.value);
}
watch([screen, processBundle], () => reload(), { immediate: true });

// Action dispatch: the projected manifest action id is the execution
// contract's id — the run API resolves the rest server-side.
async function runGeneratedAction(action, data = {}) {
  const scope = screen.value?.scope || {};
  const entityId = scope.instanceId || scope.entityId || null;
  try {
    await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(action.id)}/execute`, {
      method: 'POST',
      body: { entityId, entities: {}, data, parameters: {} }
    });
    toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await reload();
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    toast.add({ severity: 'error', summary: action.label || action.id, detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function synthesizedDetailScreen(key = '') {
  if (!String(key).endsWith('_detail')) return null;
  const baseKey = String(key).slice(0, -'_detail'.length);
  const base = authStore.screenManifest.find(item => item.screenKey === baseKey);
  if (!base?.entityType) return null;
  const sourceId = base.sources?.[0]?.id || base.entityType;
  const required = base.required || base.sources?.[0]?.required || null;
  return {
    ...base,
    id: `${base.id || baseKey}_detail`,
    screenKey: key,
    route: `/screens/${encodeURIComponent(key)}`,
    template: 'entityDetail',
    placement: 'detail',
    sources: [{
      id: sourceId,
      entityType: base.entityType,
      mode: 'single',
      required,
      identifier: '$screen.scope.entityId'
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
    .filter(([key]) => key === 'entityId' || key.endsWith('Id'))
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
  // The generator resolves single sources through scope.instanceId.
  if (scope.entityId && !scope.instanceId) scope.instanceId = scope.entityId;
  return scope;
}
</script>
