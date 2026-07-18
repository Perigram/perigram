<template>
  <div class="flex h-full min-h-0 flex-col gap-4 p-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h1 class="m-0">{{ $t('admin.workflows.title') }}</h1>
        <p class="m-0 text-muted-color">{{ $t('admin.workflows.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button icon="pi pi-refresh" :label="$t('common.reset')" severity="secondary" outlined @click="loadDefaultWorkflow" />
        <Button icon="pi pi-save" :label="$t('admin.workflows.saveOverride')" :loading="saving" @click="saveOverride" />
      </div>
    </div>

    <Panel>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,22rem)_auto_auto] md:items-end">
        <div class="flex min-w-0 flex-col gap-2">
          <label>{{ $t('admin.domainBuilder.entityType') }}</label>
          <Select
            v-model="selectedEntityType"
            :options="editableEntityOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            :loading="loading"
          />
        </div>
        <Tag :value="activeOverride ? $t('admin.workflows.overrideActive') : $t('admin.workflows.defaultWorkflow')" :severity="activeOverride ? 'warn' : 'secondary'" />
        <Tag v-if="dirty" :value="$t('admin.workflows.unsaved')" severity="info" />
      </div>
    </Panel>

    <Message v-if="error" severity="error">{{ error }}</Message>
    <Message v-else-if="loading" severity="info">{{ $t('common.loading') }}</Message>
    <WorkflowDesignerV2
      v-else-if="selectedWorkflow"
      v-model="selectedWorkflow"
      :feature="entityFeature(selectedEntityType)"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from '~/components/shared/EntitySelect.vue';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const authStore = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const domainWorkflows = ref({});
const entities = ref([]);
const selectedEntityType = ref('');
const selectedWorkflow = ref(null);
const activeOverride = ref(null);
const savedSnapshot = ref('');

const editableEntityOptions = computed(() => entities.value
  .filter(entity => domainWorkflows.value[entity.type])
  .filter(entity => authStore.hasPermission(entityFeature(entity.type), 'admin'))
  .map(entity => ({
    label: `${entity.label || entity.type} (${entity.type})`,
    value: entity.type
  })));

const dirty = computed(() => JSON.stringify(selectedWorkflow.value || null) !== savedSnapshot.value);

onMounted(loadDomain);

watch(selectedEntityType, async (type) => {
  if (!type) return;
  await loadOverride(type);
});

async function loadDomain() {
  loading.value = true;
  error.value = '';
  try {
    const response = await $fetch('/api/admin/domain');
    entities.value = response.entities || [];
    domainWorkflows.value = response.workflows || {};
    selectedEntityType.value ||= editableEntityOptions.value[0]?.value || '';
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.workflows.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadOverride(entityType = selectedEntityType.value) {
  if (!entityType) return;
  loading.value = true;
  error.value = '';
  try {
    activeOverride.value = await $fetch(`/api/workflow-overrides/${entityType}`);
    selectedWorkflow.value = clonePlain(activeOverride.value?.workflow || domainWorkflows.value[entityType] || null);
    savedSnapshot.value = JSON.stringify(selectedWorkflow.value || null);
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.workflows.loadFailed');
  } finally {
    loading.value = false;
  }
}

function loadDefaultWorkflow() {
  selectedWorkflow.value = clonePlain(domainWorkflows.value[selectedEntityType.value] || null);
}

async function saveOverride() {
  if (!selectedEntityType.value || !selectedWorkflow.value) return;
  saving.value = true;
  error.value = '';
  try {
    activeOverride.value = await $fetch(`/api/workflow-overrides/${selectedEntityType.value}`, {
      method: 'PUT',
      body: { workflow: selectedWorkflow.value }
    });
    selectedWorkflow.value = clonePlain(activeOverride.value.workflow);
    savedSnapshot.value = JSON.stringify(selectedWorkflow.value || null);
  } catch (err) {
    error.value = err?.data?.message || err?.message || t('admin.workflows.saveFailed');
  } finally {
    saving.value = false;
  }
}

function entityFeature(entityType) {
  if (entityType === 'project') return 'projects';
  if (entityType === 'queue') return 'queues';
  if (['material', 'material_pile', 'sheet', 'remnant', 'geometry_capture'].includes(entityType)) return 'materials';
  if (entityType === 'requisition') return 'requisitions';
  if (String(entityType || '').includes('cassette')) return 'projects';
  return String(entityType || '').replace(/_/g, '-');
}

function clonePlain(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}
</script>
