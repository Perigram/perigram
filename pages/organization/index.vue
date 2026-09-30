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
      <!-- Targeted invitations addressed to this account (accept joins in
           one handshake, so auth re-hydrates after responding). -->
      <TableFrame v-if="invitations.length" class="ck-collection-rows">
        <DataTable :value="invitations" :pt="invitationTablePt">
          <Column field="organizationName" :header="$t('auth.organization')" />
          <Column :header="$t('organization.processRoles')">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Tag v-for="label in data.roleLabels" :key="label" :value="label" severity="info" size="small" />
              </div>
            </template>
          </Column>
          <Column field="expiresAt" :header="$t('auth.expires')">
            <template #body="{ data }">
              {{ new Date(data.expiresAt).toLocaleDateString() }}
            </template>
          </Column>
          <Column :header="$t('common.actions.title')" class="text-right">
            <template #body="{ data }">
              <div class="flex justify-end gap-2">
                <Button icon="pi pi-check" :label="$t('common.approve')" severity="success" size="small" :loading="respondingInviteId === data._id" @click="respondInvitation(data, 'accept')" />
                <Button icon="pi pi-times" :label="$t('common.reject')" severity="danger" size="small" text :loading="respondingInviteId === data._id" @click="respondInvitation(data, 'decline')" />
              </div>
            </template>
          </Column>
        </DataTable>
      </TableFrame>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
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

// Targeted invitations for this account: accept makes the membership
// active in a single handshake, so the store must re-hydrate afterwards.
const invitations = ref([]);
const respondingInviteId = ref(null);
const invitationTablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};
const loadInvitations = async () => {
  try {
    invitations.value = await $fetch('/api/invitations/mine');
  } catch {
    invitations.value = [];
  }
};
const respondInvitation = async (invitation, action) => {
  respondingInviteId.value = invitation._id;
  try {
    await $fetch(`/api/invitations/${invitation._id}/respond`, {
      method: 'POST',
      body: { action }
    });
    toast.add({
      severity: 'success',
      summary: t('common.success'),
      detail: t(action === 'accept' ? 'auth.invitationAccepted' : 'auth.invitationDeclined'),
      life: 3000
    });
    await authStore.setUser();
    await loadInvitations();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    respondingInviteId.value = null;
  }
};
onMounted(loadInvitations);
</script>
