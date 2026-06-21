<template>
  <StandardPage :title="$t('organization.workspace')" :subtitle="organizationName">
    <ResponsiveGrid variant="wide">
      <Panel>
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-users text-xl text-primary" aria-hidden="true"></i>
            <div class="min-w-0">
              <h2 class="m-0 text-base">{{ $t('organization.teamManagement') }}</h2>
              <small class="text-muted-color">{{ $t('organization.teamManagementHint') }}</small>
            </div>
          </div>
          <div class="mt-auto">
            <Button icon="pi pi-arrow-right" :label="$t('organization.openTeam')" size="small" @click="navigateTo('/organization/users')" />
          </div>
        </div>
      </Panel>

      <Panel>
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-center gap-3">
            <i class="pi pi-sitemap text-xl text-primary" aria-hidden="true"></i>
            <div class="min-w-0">
              <h2 class="m-0 text-base">{{ $t('processDesigner.title') }}</h2>
              <small class="text-muted-color">{{ $t('organization.processDesignerHint') }}</small>
            </div>
          </div>
          <div class="mt-auto">
            <Button icon="pi pi-arrow-right" :label="$t('organization.openProcessDesigner')" size="small" @click="navigateTo('/organization/process')" />
          </div>
        </div>
      </Panel>
    </ResponsiveGrid>
  </StandardPage>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const authStore = useAuthStore();
const organizationName = computed(() => authStore.organizationData?.identity?.name || authStore.organizationData?.name || '');
</script>
