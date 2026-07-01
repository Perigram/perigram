<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <GeneratedScreen v-else-if="organizationScreen" :screen="organizationScreen" />
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const authStore = useAuthStore();
const refreshingAuth = ref(true);

const organizationScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'organizationOverview' || screen.screenKey === 'organization_overview') || null);

onMounted(() => refreshProcessManifest());

async function refreshProcessManifest() {
  refreshingAuth.value = true;
  try {
    await authStore.setUser();
  } finally {
    refreshingAuth.value = false;
  }
}
</script>
