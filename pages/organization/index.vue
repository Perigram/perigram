<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <!-- Orgless accounts have no overview to render: their entry surface is
       organization creation (the account menu owns the same affordance —
       this page carries the no-org shell's inline form). -->
  <StandardPage v-else-if="orgless" :title="$t('auth.organization')">
    <div class="mx-auto flex max-w-md flex-col gap-6 py-10">
      <div class="flex flex-col gap-2 text-center">
        <i class="pi pi-building text-muted" style="font-size: 2rem" aria-hidden="true" />
        <p class="m-0 text-supporting text-muted">{{ t('profile.noOrganizationHelp') }}</p>
      </div>
      <form class="flex flex-col gap-4" @submit.prevent="createOrganization">
        <div class="flex flex-col gap-1">
          <label for="orgless-org-name">{{ t('common.name') }} *</label>
          <InputText id="orgless-org-name" v-model="orgForm.name" required class="w-full" autofocus />
        </div>
        <div class="flex flex-col gap-1">
          <label for="orgless-org-email">{{ t('profile.email') }} *</label>
          <InputText id="orgless-org-email" v-model="orgForm.email" type="email" required class="w-full" />
        </div>
        <Button type="submit" :label="t('auth.createOrg')" icon="pi pi-plus" :loading="creating" />
      </form>
    </div>
  </StandardPage>
  <GeneratedScreen v-else-if="organizationScreen" :screen="organizationScreen" />
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const instances = useInstancesStore();
const refreshingAuth = ref(!authStore.userIsSet);

// An account with neither an active organization nor any membership has
// nothing to show an overview of.
const orgless = computed(() => !authStore.userData?.organizationId && authStore.memberships.length === 0);

const organizationScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'organizationOverview' || screen.screenKey === 'organization_overview') || null);

const orgForm = reactive({ name: '', email: '' });
const creating = ref(false);
const createOrganization = async () => {
  creating.value = true;
  try {
    await instances.createInstance('organization', { ...orgForm });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.organizationCreated'), life: 3000 });
    await authStore.setUser();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('auth.organizationCreateFailed'), life: 3000 });
  } finally {
    creating.value = false;
  }
};
</script>
