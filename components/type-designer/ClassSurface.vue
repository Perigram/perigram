<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <SurfaceHeader
      v-if="type"
      :type="type"
      :title="type.name || ''"
      :level="0"
    />
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <template v-if="type">
        <div class="flex items-center justify-end">
          <Button
            icon="pi pi-pencil"
            :label="$t('classes.editTitle')"
            size="small"
            text
            severity="secondary"
            @click="editorOpen = true"
          />
        </div>

        <Panel :header="$t('classes.fields')">
          <div class="flex flex-col gap-2">
            <div
              v-for="field in fieldRows"
              :key="field.name"
              class="flex min-w-0 items-center gap-3 border-b border-chrome-border py-1.5 last:border-b-0"
            >
              <span class="min-w-0 flex-1 truncate text-body">{{ field.name }}</span>
              <span class="text-muted text-supporting">{{ field.summary }}</span>
            </div>
          </div>
        </Panel>

        <Panel v-if="stateRows.length" :header="$t('classes.states')">
          <div class="flex flex-wrap gap-2">
            <Tag
              v-for="state in stateRows"
              :key="state.value"
              :value="state.label || state.value"
              :severity="state.severity || 'info'"
              :icon="state.icon || undefined"
            />
          </div>
        </Panel>

        <Panel :header="$t('classes.instances')">
          <div v-if="loading" class="text-muted text-supporting">{{ $t('common.loading') }}</div>
          <div v-else-if="loadError" class="text-muted text-supporting">{{ $t('classes.instancesUnavailable') }}</div>
          <div v-else-if="!instanceRows.length" class="text-muted text-supporting">{{ $t('classes.noInstances') }}</div>
          <div v-else class="flex flex-col gap-1">
            <div
              v-for="row in instanceRows"
              :key="row.id"
              class="flex min-w-0 items-center gap-3 border-b border-chrome-border py-1.5 last:border-b-0"
            >
              <span class="min-w-0 flex-1 truncate text-body">{{ row.label }}</span>
              <Tag v-if="row.state" :value="row.state" severity="secondary" />
            </div>
          </div>
        </Panel>
      </template>

      <Message v-else severity="warn" :closable="false">{{ $t('common.notAvailable') }}</Message>
    </div>

    <ClassDialog
      v-if="type && editorOpen"
      v-model:visible="editorOpen"
      :type="type"
      :type-id="type.id"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import SurfaceHeader from '~/components/ui-mapping/SurfaceHeader.vue';
import ClassDialog from '~/components/type-designer/ClassDialog.vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useInstancesStore } from '~/stores/instances';
import { fieldDescriptorSummary } from '~/utils/processDesignerDeclarationEditor.js';
import { titleFor } from '#shared/ui-mapping/index.js';

const props = defineProps({
  typeId: { type: String, required: true }
});

const { t } = useI18n();
const view = useFileTypeView();
const instances = useInstancesStore();
const type = computed(() => view.typeById(props.typeId));
const editorOpen = ref(false);
const loading = ref(false);
const loadError = ref('');
const items = ref([]);

const fieldRows = computed(() => Object.entries(type.value?.fields || {}).map(([name, descriptor]) => ({
  name,
  summary: fieldDescriptorSummary(descriptor, id => view.typeById(id)?.name || id)
})));

const stateRows = computed(() => Object.entries(type.value?.stateVocabulary || {}).map(([value, declaration]) => ({
  value,
  label: declaration?.policy?.label || value,
  severity: declaration?.policy?.severity || 'info',
  icon: declaration?.policy?.icon || null
})));

const instanceRows = computed(() => items.value.map(item => ({
  id: String(item._id),
  label: titleFor(item, type.value, { unnamedLabel: t('common.unnamed') }),
  state: item.state || ''
})));

async function load() {
  if (!props.typeId) return;
  loading.value = true;
  loadError.value = '';
  try {
    items.value = await instances.listInstances(props.typeId, { limit: 50 }, { silent: true });
  } catch {
    items.value = [];
    loadError.value = 'unavailable';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.typeId, load);
</script>
