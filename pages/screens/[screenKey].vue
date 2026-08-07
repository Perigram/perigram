<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <GeneratedScreen v-else-if="screen" :screen="screen" />
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const authStore = useAuthStore();
// The auth middleware has already hydrated this store for SSR and client route
// navigation. Re-fetching it on mount replaces the manifest and unmounts the
// generated workspace immediately after hydration.
const refreshingAuth = ref(!authStore.userIsSet);

const screenKey = computed(() => Array.isArray(route.params.screenKey)
  ? route.params.screenKey.join('/')
  : route.params.screenKey
);
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
  return Object.fromEntries(Object.entries(query)
    .filter(([key]) => key === 'entityId' || key.endsWith('Id'))
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
}
</script>
