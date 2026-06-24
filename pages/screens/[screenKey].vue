<template>
  <GeneratedScreen v-if="screen" :screen="screen" />
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed } from 'vue';
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

const screenKey = computed(() => Array.isArray(route.params.screenKey)
  ? route.params.screenKey.join('/')
  : route.params.screenKey
);
const screen = computed(() => {
  const base = authStore.screenManifest.find(item => item.screenKey === screenKey.value);
  if (!base) return null;
  return {
    ...base,
    scope: {
      ...(base.scope || {}),
      ...scopeFromQuery(route.query)
    }
  };
});

function scopeFromQuery(query = {}) {
  return Object.fromEntries(Object.entries(query)
    .filter(([key]) => key === 'entityId' || key.endsWith('Id'))
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
}
</script>
