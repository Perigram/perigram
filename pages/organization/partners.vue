<template>
  <StandardPage :title="$t('partnerships.title')">
    <div class="flex flex-col gap-6 py-4">
      <Panel :header="$t('partnerships.findOrganizations')">
        <div class="flex flex-col gap-3">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="searchQuery"
              type="text"
              class="w-full"
              :placeholder="$t('directory.searchPlaceholder')"
              data-testid="partner-search-input"
            />
          </IconField>
          <div v-if="searching" class="text-muted text-body">{{ $t('directory.searching') }}</div>
          <template v-else-if="searchResults.length">
            <div
              v-for="org in searchResults"
              :key="org._id"
              class="flex items-center gap-3"
              :data-partner-candidate="org._id"
            >
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle">
                <i class="pi pi-building" aria-hidden="true" />
              </span>
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col border-0 bg-transparent p-0 text-left cursor-pointer"
                :data-partner-candidate="org._id"
                @click="openOrganization(org._id)"
              >
                <span class="truncate text-body">{{ org.identity?.name }}</span>
                <small v-if="org.directory?.isMember" class="text-muted">{{ $t('partnerships.alreadyMember') }}</small>
              </button>
              <Tag v-if="org.data?.type" :value="org.data.type" severity="secondary" />
              <Button
                v-if="!org.directory?.isMember && !partnershipWith(org._id)"
                icon="pi pi-handshake"
                size="small"
                :aria-label="$t('partnerships.addPartner')"
                :loading="requestingId === org._id"
                @click="requestPartnership(org)"
              />
              <Tag v-else-if="partnershipWith(org._id)" :value="$t(`partnerships.status.${partnershipWith(org._id).status}`)" severity="secondary" />
            </div>
          </template>
          <div v-else-if="trimmedSearchQuery" class="text-muted text-body">{{ $t('directory.noResults') }}</div>
        </div>
      </Panel>

      <template v-for="section in sections" :key="section.key">
        <div v-if="section.rows.length" class="flex flex-col gap-4">
          <ActionToolbar :title="section.title" />
          <TableFrame class="ck-collection-rows">
            <DataTable :value="section.rows" :pt="tablePt" :row-class="rowSurfaceClass">
              <Column field="partnerOrganization.name" :header="$t('auth.organization')">
                <template #body="{ data }">
                  <button
                    type="button"
                    class="border-0 bg-transparent p-0 text-left cursor-pointer"
                    @click="openOrganization(data.partnerOrganization._id)"
                  >
                    {{ data.partnerOrganization.name }}
                  </button>
                </template>
              </Column>
              <Column v-if="section.key === 'incoming'" :header="$t('common.actions.title')" class="text-right">
                <template #body="{ data }">
                  <div class="flex justify-end gap-2">
                    <Button icon="pi pi-check" :label="$t('common.approve')" severity="success" size="small" :loading="respondingId === data._id" @click="respond(data, 'accept')" />
                    <Button icon="pi pi-times" :label="$t('common.reject')" severity="danger" size="small" text :loading="respondingId === data._id" @click="respond(data, 'decline')" />
                  </div>
                </template>
              </Column>
              <Column v-else :header="$t('common.actions.title')" class="text-right">
                <template #body="{ data }">
                  <div class="flex justify-end gap-2">
                    <Button
                      icon="pi pi-times"
                      :label="section.key === 'active' ? $t('partnerships.terminate') : $t('common.cancel')"
                      severity="danger"
                      size="small"
                      text
                      :loading="respondingId === data._id"
                      @click="cancel(data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
          </TableFrame>
        </div>
      </template>

      <div v-if="!loading && !partnerships.length" class="text-muted text-body">{{ $t('partnerships.none') }}</div>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

// Shared table row-surface recipe (see organization users page).
const rowSurfaceClass = () => '[clip-path:inset(0_round_var(--p-border-radius-xl))]';
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const partnerships = ref([]);
const loading = ref(true);
const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const requestingId = ref(null);
const respondingId = ref(null);

const trimmedSearchQuery = computed(() => searchQuery.value.trim());
const activeOrganizationId = computed(() =>
  authStore.organizationData?._id
  || authStore.userData?.organizationId
  || null);
const sections = computed(() => [
  { key: 'incoming', title: t('partnerships.incoming'), rows: partnerships.value.filter(item => item.status === 'pending' && item.direction === 'incoming') },
  { key: 'outgoing', title: t('partnerships.outgoing'), rows: partnerships.value.filter(item => item.status === 'pending' && item.direction === 'outgoing') },
  { key: 'active', title: t('partnerships.active'), rows: partnerships.value.filter(item => item.status === 'active') }
]);

let searchTimer = null;
let requestSeq = 0;

watch(searchQuery, (value) => {
  clearTimeout(searchTimer);
  const normalized = value.trim();
  if (normalized.length < 2) {
    searchResults.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    const seq = ++requestSeq;
    try {
      const response = await $fetch('/api/directory/search', { query: { q: normalized, types: 'organization' } });
      if (seq !== requestSeq) return;
      searchResults.value = (response?.groups || []).flatMap(group => group.results || []);
    } catch {
      if (seq === requestSeq) searchResults.value = [];
    } finally {
      if (seq === requestSeq) searching.value = false;
    }
  }, 300);
});

onMounted(loadPartnerships);

async function loadPartnerships() {
  if (!activeOrganizationId.value) {
    loading.value = false;
    return;
  }
  try {
    partnerships.value = await $fetch('/api/partnerships');
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    loading.value = false;
  }
}

function partnershipWith(organizationId) {
  return partnerships.value.find(item => String(item.partnerOrganization?._id) === String(organizationId)) || null;
}

// Partner organizations open inside the home workspace, never a route.
function openOrganization(organizationId) {
  openInstanceInWorkspace({ typeId: 'organization', instanceId: String(organizationId) });
}

async function requestPartnership(org) {
  requestingId.value = org._id;
  try {
    await $fetch('/api/partnerships', {
      method: 'POST',
      body: { partnerOrganizationId: org._id }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('partnerships.requestSent'), life: 3000 });
    searchQuery.value = '';
    await loadPartnerships();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    requestingId.value = null;
  }
}

async function respond(partnership, action) {
  respondingId.value = partnership._id;
  try {
    await $fetch(`/api/partnerships/${partnership._id}/${action}`, { method: 'POST' });
    await loadPartnerships();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    respondingId.value = null;
  }
}

async function cancel(partnership) {
  if (!window.confirm(t('partnerships.cancelConfirm'))) return;
  respondingId.value = partnership._id;
  try {
    await $fetch(`/api/partnerships/${partnership._id}`, { method: 'DELETE' });
    await loadPartnerships();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    respondingId.value = null;
  }
}
</script>

<style scoped>
/* Row-surface rhythm (layout-only declarations): the shared recipe —
   separated cell borders leave a hairline gap between rounded rows. */
.ck-collection-rows :deep(.p-datatable-table) {
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}
</style>
