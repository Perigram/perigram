<template>
  <!-- Targeted invitations addressed to this account (see
       server/features/invitations/README.md). Renders nothing when the
       account holds none. -->
  <TableFrame v-if="invitations.length" class="ck-collection-rows">
    <DataTable :value="invitations" :pt="tablePt">
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
          {{ new Date(data.expiresAt).toLocaleDateString(locale) }}
        </template>
      </Column>
      <Column :header="$t('common.actions.title')" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-check" :label="$t('common.approve')" severity="success" size="small" :loading="respondingId === data._id" @click="respond(data, 'accept')" />
            <Button icon="pi pi-times" :label="$t('common.reject')" severity="danger" size="small" text :loading="respondingId === data._id" @click="respond(data, 'decline')" />
          </div>
        </template>
      </Column>
    </DataTable>
  </TableFrame>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import TableFrame from '~/components/shared/TableFrame.vue';
import { useAuthStore } from '~/stores/auth';

const { t, locale } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const invitations = ref([]);
const respondingId = ref(null);
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

// Accepting completes the single-handshake membership, so auth must
// re-hydrate for the new membership to appear in every surface.
async function load() {
  try {
    invitations.value = await $fetch('/api/invitations/mine');
  } catch {
    invitations.value = [];
  }
}

async function respond(invitation, action) {
  respondingId.value = invitation._id;
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
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    respondingId.value = null;
  }
}

onMounted(load);
</script>
