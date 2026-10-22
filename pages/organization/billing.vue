<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <StandardPage v-else-if="organizationScreen" :title="screenTitle" :back="back">
    <GeneratedOrganizationAccount :screen="organizationScreen" />
  </StandardPage>
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import GeneratedOrganizationAccount from '~/components/generated/GeneratedOrganizationAccount.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { generatedScreenLabel } from '~/utils/generated-labels.js';
import { usePageBack } from '~/composables/usePageBack.js';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const { t, te } = useI18n();
const authStore = useAuthStore();
const refreshingAuth = ref(!authStore.userIsSet);
// The billing surface renders as this route and inside a home pane tab:
// the back control belongs to the route.
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/billing' });

const organizationScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'organizationAccount' || screen.screenKey === 'organization_billing') || null);
const screenTitle = computed(() => generatedScreenLabel(organizationScreen.value, { t, te }));
</script>
