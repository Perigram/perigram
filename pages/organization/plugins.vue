<template>
  <StandardPage :title="$t('plugins.title')">
    <div class="flex flex-col gap-6 py-4">
      <div v-if="installed.length" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('plugins.installed')" />
        <TableFrame class="ck-collection-rows">
          <DataTable :value="installed" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="plugins-installed-table">
            <Column field="name" :header="$t('plugins.title')">
              <template #body="{ data }">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-body">{{ data.name }}</span>
                  <small v-if="data.types.length" class="text-muted">
                    {{ data.types.map(type => type.label || type.id).join(', ') }}
                  </small>
                </div>
              </template>
            </Column>
            <Column field="version" :header="$t('plugins.version')">
              <template #body="{ data }">
                <Tag :value="data.version" severity="secondary" />
              </template>
            </Column>
            <Column field="installedAt" :header="$t('plugins.installedOn')">
              <template #body="{ data }">
                {{ formatDate(data.installedAt) }}
              </template>
            </Column>
            <Column :header="$t('common.actions.title')" class="text-right">
              <template #body="{ data }">
                <div class="flex justify-end gap-2">
                  <Button
                    v-if="data.services.length"
                    icon="pi pi-key"
                    :aria-label="$t('plugins.connector')"
                    severity="secondary"
                    size="small"
                    text
                    @click="openConnector(data)"
                  />
                  <Button
                    icon="pi pi-trash"
                    :aria-label="$t('plugins.uninstall')"
                    severity="danger"
                    size="small"
                    text
                    :loading="workingPluginId === data.pluginId"
                    @click="uninstall(data)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </TableFrame>
      </div>
      <div v-else-if="!loading" class="text-muted text-body">{{ $t('plugins.noneInstalled') }}</div>

      <div v-if="systemPacks.length" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('plugins.builtIn')" />
        <TableFrame class="ck-collection-rows">
          <DataTable :value="systemPacks" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="plugins-system-table">
            <Column field="name" :header="$t('plugins.title')">
              <template #body="{ data }">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-body">{{ data.name }}</span>
                  <small v-if="data.types.length || data.services.length" class="text-muted">
                    {{ [...data.types.map(type => type.label || type.id), ...data.services.map(service => service.label)].join(', ') }}
                  </small>
                </div>
              </template>
            </Column>
          </DataTable>
        </TableFrame>
      </div>

      <Panel :header="$t('plugins.available')">
        <div v-if="!catalog.length && !loading" class="text-muted text-body">{{ $t('plugins.noneAvailable') }}</div>
        <TableFrame v-else class="ck-collection-rows">
          <DataTable :value="catalog" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="plugins-catalog-table">
            <Column field="name" :header="$t('plugins.title')">
              <template #body="{ data }">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-body">{{ data.name }}</span>
                  <small v-if="data.description" class="text-muted">{{ data.description }}</small>
                </div>
              </template>
            </Column>
            <Column field="version" :header="$t('plugins.version')">
              <template #body="{ data }">
                <Tag :value="data.version" severity="secondary" />
              </template>
            </Column>
            <Column :header="$t('common.actions.title')" class="text-right">
              <template #body="{ data }">
                <Tag
                  v-if="installedPluginIds.has(data.pluginId)"
                  :value="$t('plugins.installedBadge')"
                  severity="secondary"
                />
                <Button
                  v-else
                  icon="pi pi-download"
                  :aria-label="$t('plugins.install')"
                  size="small"
                  @click="openInstall(data)"
                />
              </template>
            </Column>
          </DataTable>
        </TableFrame>
      </Panel>
    </div>

    <StandardDialog
      v-model:visible="installDialogVisible"
      :header="$t('plugins.installConfirmTitle')"
      size="sm"
    >
      <div v-if="pendingInstall" class="flex flex-col gap-3">
        <div class="text-body">{{ $t('plugins.installConfirmIntro') }}</div>
        <ul class="m-0 flex list-none flex-col gap-1 pl-0">
          <li v-for="type in pendingInstall.types" :key="type.id" class="text-body">
            <i class="pi pi-check-circle mr-2 text-muted" aria-hidden="true" />
            {{ type.label || type.id }}
          </li>
        </ul>
        <template v-if="pendingInstall.services.length">
          <div class="text-body">{{ $t('plugins.services') }}</div>
          <ul class="m-0 flex list-none flex-col gap-1 pl-0">
            <li v-for="service in pendingInstall.services" :key="service.id" class="text-body">
              <i class="pi pi-bolt mr-2 text-muted" aria-hidden="true" />
              {{ service.label }}
            </li>
          </ul>
        </template>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="installDialogVisible = false" />
        <Button
          :label="$t('plugins.install')"
          icon="pi pi-download"
          :loading="workingPluginId === pendingInstall?.pluginId"
          @click="confirmInstall"
        />
      </template>
    </StandardDialog>

    <StandardDialog
      v-model:visible="connectorDialogVisible"
      :header="$t('plugins.connector')"
      size="md"
    >
      <div v-if="connector" class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <div class="text-muted text-label">{{ $t('plugins.token') }}</div>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-[var(--p-border-radius-xl)] bg-subtle px-3 py-2 text-technical">{{ connector.token }}</code>
            <Button
              icon="pi pi-copy"
              :aria-label="$t('plugins.copy')"
              severity="secondary"
              size="small"
              text
              @click="copyToken"
            />
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="text-muted text-label">{{ $t('plugins.endpoints') }}</div>
          <ul class="m-0 flex list-none flex-col gap-1 pl-0 text-technical">
            <li v-for="(path, name) in connector.endpoints" :key="name">
              POST {{ path }} <span class="text-muted">· x-worker-token</span>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <Button
          :label="$t('plugins.regenerate')"
          severity="danger"
          text
          :loading="regenerating"
          @click="regenerateToken"
        />
        <Button :label="$t('common.close')" severity="secondary" @click="connectorDialogVisible = false" />
      </template>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

// Shared table row-surface recipe (see organization partners page).
const rowSurfaceClass = () => '[clip-path:inset(0_round_var(--p-border-radius-xl))]';
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const { t, locale } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const catalog = ref([]);
const installed = ref([]);
const systemPacks = ref([]);
const loading = ref(true);
const installDialogVisible = ref(false);
const pendingInstall = ref(null);
const workingPluginId = ref(null);
const connectorDialogVisible = ref(false);
const connector = ref(null);
const regenerating = ref(false);

const activeOrganizationId = computed(() =>
  authStore.organizationData?._id
  || authStore.userData?.organizationId
  || null);
const installedPluginIds = computed(() => new Set(installed.value.map(item => item.pluginId)));

onMounted(load);

async function load() {
  if (!activeOrganizationId.value) {
    loading.value = false;
    return;
  }
  try {
    const [catalogResponse, installedResponse, packsResponse] = await Promise.all([
      $fetch('/api/plugins/catalog'),
      $fetch(`/api/organizations/${activeOrganizationId.value}/plugins`),
      $fetch('/api/plugins/packs')
    ]);
    catalog.value = catalogResponse || [];
    installed.value = installedResponse || [];
    systemPacks.value = packsResponse || [];
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    loading.value = false;
  }
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale.value);
}

function openInstall(listing) {
  pendingInstall.value = listing;
  installDialogVisible.value = true;
}

async function confirmInstall() {
  const listing = pendingInstall.value;
  if (!listing) return;
  workingPluginId.value = listing.pluginId;
  try {
    await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins`, {
      method: 'POST',
      body: { pluginId: listing.pluginId }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('plugins.installedToast'), life: 3000 });
    installDialogVisible.value = false;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  } finally {
    workingPluginId.value = null;
  }
}

async function uninstall(item) {
  if (!window.confirm(t('plugins.uninstallConfirm'))) return;
  workingPluginId.value = item.pluginId;
  try {
    await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(item.pluginId)}`, {
      method: 'DELETE'
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('plugins.uninstalledToast'), life: 3000 });
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  } finally {
    workingPluginId.value = null;
  }
}

async function openConnector(item) {
  connector.value = null;
  connectorDialogVisible.value = true;
  try {
    connector.value = await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(item.pluginId)}/connector`);
  } catch (error) {
    connectorDialogVisible.value = false;
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  }
}

async function copyToken() {
  if (!connector.value?.token) return;
  await navigator.clipboard.writeText(connector.value.token);
  toast.add({ severity: 'info', summary: t('common.success'), detail: t('plugins.copied'), life: 2000 });
}

async function regenerateToken() {
  if (!connector.value) return;
  regenerating.value = true;
  try {
    const result = await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(connector.value.pluginId)}/connector/regenerate`, {
      method: 'POST'
    });
    connector.value = { ...connector.value, token: result.token };
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('plugins.tokenRegenerated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  } finally {
    regenerating.value = null;
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
