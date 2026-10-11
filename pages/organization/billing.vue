<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <GeneratedScreen v-else-if="organizationScreen" :screen="organizationScreen" :back="back" />
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { usePageBack } from '~/composables/usePageBack.js';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const authStore = useAuthStore();
const refreshingAuth = ref(!authStore.userIsSet);
// The billing screen renders through GeneratedScreen both as this route
// and inside a home pane tab: the back control belongs to the route.
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/billing' });

const organizationScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'organizationAccount' || screen.screenKey === 'organization_billing') || null);

</script>
