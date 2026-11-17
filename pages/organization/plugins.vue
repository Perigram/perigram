<template>
  <StandardPage :title="$t('plugins.title')" :back="back">
    <div class="flex flex-col gap-6">
      <div v-if="installed.length" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('plugins.installed')" />
        <TableFrame class="ck-collection-rows">
          <DataTable :value="installed" :pt="tablePt" :row-class="rowSurfaceClass" data-testid="plugins-installed-table">
            <Column field="name" :header="$t('plugins.title')">
              <template #body="{ data }">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-body">{{ data.name }}</span>
                  <small v-if="data.types.length" class="text-muted">
                    {{ data.types.map(type => typeDisplayName(type)).join(', ') }}
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
                    <Tag
                    v-if="data.availableVersion"
                    :value="`${data.version} → ${data.availableVersion}`"
                    severity="warn"
                  />
                  <Button
                    v-if="data.availableVersion"
                    icon="pi pi-arrow-up"
                    :aria-label="$t('plugins.upgrade')"
                    size="small"
                    @click="openUpgrade(data)"
                  />
                  <Button
                    v-if="hasRemoteServices(data)"
                    icon="pi pi-key"
                    :aria-label="$t('plugins.connector')"
                    severity="secondary"
                    size="small"
                    text
                    @click="openConnector(data)"
                  />
                  <Button
                    v-if="hasEndpointServices(data)"
                    icon="pi pi-sliders-h"
                    :aria-label="$t('plugins.settings')"
                    severity="secondary"
                    size="small"
                    text
                    @click="openSettings(data)"
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
            {{ typeDisplayName(type) }}
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
              POST {{ path }} <span class="text-muted">{{ $t('plugins.workerHeader') }}</span>
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
    <StandardDialog
      v-model:visible="upgradeDialogVisible"
      :header="$t('plugins.upgradeTitle')"
      size="md"
    >
      <div v-if="upgradePlan" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Tag :value="upgradePlan.from" severity="secondary" />
          <i class="pi pi-arrow-right text-muted" aria-hidden="true" />
          <Tag :value="upgradePlan.to" />
        </div>
        <div v-if="upgradePlan.added.length" class="flex flex-col gap-1">
          <div class="text-muted text-label">{{ $t('plugins.added') }}</div>
          <div class="text-body">{{ upgradePlan.added.map(type => typeDisplayName(type)).join(', ') }}</div>
        </div>
        <div v-if="upgradePlan.removed.length" class="flex flex-col gap-1">
          <div class="text-muted text-label">{{ $t('plugins.removed') }}</div>
          <div class="text-body">{{ upgradePlan.removed.map(type => typeDisplayName(type)).join(', ') }}</div>
        </div>
        <div v-if="upgradePlan.renamed?.length" class="flex flex-col gap-1">
          <div class="text-muted text-label">{{ $t('plugins.renamed') }}</div>
          <div class="text-body">
            {{ upgradePlan.renamed.map(entry => `${entry.from} → ${entry.to}`).join(', ') }}
          </div>
        </div>
        <div v-if="upgradePlan.changed.length" class="flex flex-col gap-1">
          <div class="text-muted text-label">{{ $t('plugins.changed') }}</div>
          <ul class="m-0 flex list-none flex-col gap-1 pl-0">
            <li v-for="change in upgradePlan.changed" :key="change.typeId" class="text-body">
              <i :class="change.breaking.length ? 'pi pi-exclamation-triangle' : 'pi pi-pencil'" class="mr-2 text-muted" aria-hidden="true" />
              {{ change.name || change.typeId }}
            </li>
          </ul>
        </div>
        <div v-if="upgradePlan.blocked.length" class="flex flex-col gap-1">
          <Message severity="warn">
            {{ upgradePlan.blocked.map(blocked => `${blocked.typeId}: ${blocked.reason}`).join(' · ') }}
          </Message>
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="upgradeDialogVisible = false" />
        <Button
          :label="$t('plugins.upgrade')"
          icon="pi pi-arrow-up"
          :disabled="!!upgradePlan?.blocked?.length"
          :loading="upgrading"
          @click="confirmUpgrade"
        />
      </template>
    </StandardDialog>
    <StandardDialog
      v-model:visible="settingsDialogVisible"
      :header="$t('plugins.settings')"
      size="md"
    >
      <div v-if="settings" class="flex flex-col gap-4">
        <Message v-if="settings.hasEndpointServices" severity="info" size="small">
          {{ $t('plugins.remoteConnectionHelp', { services: settings.services.filter(service => service.mode === 'endpoint').map(service => service.label).join(', ') }) }}
        </Message>
        <div v-if="settings.hasEndpointServices" class="flex flex-col gap-2">
          <div class="text-muted text-label">{{ $t('plugins.executorOrigin') }}</div>
          <InputText
            v-model="settings.executorOrigin"
            type="text"
            class="w-full text-technical"
            :placeholder="$t('plugins.executorOriginPlaceholder')"
            data-testid="plugin-executor-origin"
          />
          <Message v-if="settings.legacyEndpointConflict" severity="warn" size="small">
            {{ $t('plugins.legacyEndpointConflict') }}
          </Message>
        </div>
        <div v-if="settings.surfaces" class="flex flex-col gap-2">
          <div class="text-muted text-label">{{ $t('plugins.surfaceOrigin') }}</div>
          <InputText
            v-model="settings.surfaceOrigin"
            type="text"
            class="w-full text-technical"
            :placeholder="$t('plugins.surfaceOriginPlaceholder')"
            data-testid="plugin-surface-origin"
          />
        </div>
        <div v-if="settings.hasEndpointServices" class="flex flex-col gap-2">
          <div class="text-muted text-label">{{ $t('plugins.apiKey') }}</div>
          <InputText
            v-model="settings.authToken"
            type="password"
            class="w-full text-technical"
            :placeholder="$t('plugins.apiKeyPlaceholder')"
            autocomplete="new-password"
          />
          <small class="text-muted">{{ $t('plugins.apiKeyHelp') }}</small>
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="settingsDialogVisible = false" />
        <Button
          :label="$t('common.save')"
          icon="pi pi-check"
          :loading="savingSettings"
          @click="saveSettings"
        />
      </template>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import StandardPage from '~/components/shared/StandardPage.vue';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { usePageBack } from '~/composables/usePageBack.js';
import { typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

// The page is mounted both as a standalone route (mobile/deep link) and
// as a home pane tab: the back control belongs to the routed surface.
const route = useRoute();
const { navigation: back } = usePageBack({ when: () => route.path === '/organization/plugins' });

// Shared table row-surface recipe (see organization partners page).
const rowSurfaceClass = () => LAYOUT.rowSurface;
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const { t, te, locale } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const authStore = useAuthStore();

const catalog = ref([]);
const installed = ref([]);
const loading = ref(true);
const installDialogVisible = ref(false);
const pendingInstall = ref(null);
const workingPluginId = ref(null);
const connectorDialogVisible = ref(false);
const connector = ref(null);
const regenerating = ref(false);
const upgradeDialogVisible = ref(false);
const upgradePlan = ref(null);
const upgrading = ref(false);
const settingsDialogVisible = ref(false);
const settings = ref(null);
const savingSettings = ref(false);

const activeOrganizationId = computed(() =>
  authStore.organizationData?._id
  || authStore.userData?.organizationId
  || null);
const installedPluginIds = computed(() => new Set(installed.value.map(item => item.pluginId)));

// Loading follows the active organization: a cold mount can outrun the
// auth store's session hydration, so the fetch re-runs when the id
// arrives (and again on an organization switch).
watch(activeOrganizationId, (id, previous) => {
  if (id && id !== previous) load();
}, { immediate: true });
onMounted(load);

async function load() {
  if (!activeOrganizationId.value) {
    loading.value = false;
    return;
  }
  try {
    const [catalogResponse, installedResponse] = await Promise.all([
      $fetch('/api/plugins/catalog'),
      $fetch(`/api/organizations/${activeOrganizationId.value}/plugins`)
    ]);
    catalog.value = [...(catalogResponse || [])];
    installed.value = [...(installedResponse || [])];
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

// The shared type-label law: localized uiMapping key first, the authored
// display name as fallback — raw ids never render.
function typeDisplayName(type) {
  return localizedLabel({ te, t }, typeLabelKey(type.id), type.name || type.id);
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
    {
      await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins`, {
        method: 'POST',
        body: { pluginId: listing.pluginId }
      });
    }
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('plugins.installedToast'), life: 3000 });
    installDialogVisible.value = false;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  } finally {
    workingPluginId.value = null;
  }
}

function hasEndpointServices(item) {
  return (item.services || []).some(service => service.mode === 'endpoint');
}

function hasRemoteServices(item) {
  return (item.services || []).some(service => service.mode === 'claim');
}

async function openSettings(item) {
  settings.value = null;
  settingsDialogVisible.value = true;
  try {
    const response = await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(item.pluginId)}/settings`);
    settings.value = {
      pluginId: response.pluginId,
      authToken: response.authToken || '',
      surfaceOrigin: response.surfaceOrigin || '',
      surfaces: response.surfaces || false,
      executorOrigin: response.executorOrigin || '',
      legacyEndpointConflict: response.legacyEndpointConflict || false,
      hasEndpointServices: response.hasEndpointServices || false
    };
  } catch (error) {
    settingsDialogVisible.value = false;
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  }
}

async function saveSettings() {
  if (!settings.value) return;
  savingSettings.value = true;
  try {
    await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(settings.value.pluginId)}/settings`, {
      method: 'POST',
      body: {
        executorOrigin: settings.value.executorOrigin || null,
        ...(settings.value.hasEndpointServices ? { authToken: settings.value.authToken || null } : {}),
        ...(settings.value.surfaces ? { surfaceOrigin: settings.value.surfaceOrigin || null } : {})
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('plugins.savedToast'), life: 3000 });
    settingsDialogVisible.value = false;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  } finally {
    savingSettings.value = false;
  }
}

async function uninstall(item) {
  // The confirm rides the uninstall preview: dependants join the removal
  // (cascade), live data is named before the server refuses it.
  let preview = { dependants: [], blocked: [] };
  try {
    preview = await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(item.pluginId)}/uninstall-preview`);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
    return;
  }
  const parts = [t('plugins.uninstallConfirm')];
  if (preview.dependants?.length) {
    parts.push(t('plugins.uninstallAlso', { list: preview.dependants.map(entry => entry.name).join(', ') }));
  }
  if (preview.blocked?.length) {
    parts.push(t('plugins.uninstallBlocked', { detail: preview.blocked.map(entry => `${entry.typeId} (${entry.instances})`).join(', ') }));
  }
  confirm.require({
    message: parts.join('\n\n'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: () => removeInstalled(item, Boolean(preview.dependants?.length))
  });
}

async function removeInstalled(item, cascade = false) {
  workingPluginId.value = item.pluginId;
  try {
    await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(item.pluginId)}${cascade ? '?cascade=1' : ''}`, {
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

async function openUpgrade(item) {
  upgradePlan.value = null;
  upgradeDialogVisible.value = true;
  try {
    upgradePlan.value = await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(item.pluginId)}/upgrade`);
  } catch (error) {
    upgradeDialogVisible.value = false;
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  }
}

async function confirmUpgrade() {
  if (!upgradePlan.value) return;
  upgrading.value = true;
  try {
    await $fetch(`/api/organizations/${activeOrganizationId.value}/plugins/${encodeURIComponent(upgradePlan.value.pluginId)}/upgrade`, {
      method: 'POST'
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('plugins.upgradedToast'), life: 3000 });
    upgradeDialogVisible.value = false;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  } finally {
    upgrading.value = null;
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
