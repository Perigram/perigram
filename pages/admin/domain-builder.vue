<template>
  <StandardPage :title="$t('admin.domainBuilder.title')" :subtitle="$t('admin.domainBuilder.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('admin.domainBuilder.resetSource')" severity="secondary" @click="resetToSource" />
      <Button icon="pi pi-upload" :label="$t('admin.domainBuilder.importDraft')" severity="secondary" @click="triggerImport" />
      <Button icon="pi pi-download" :label="$t('admin.domainBuilder.exportDraft')" severity="secondary" @click="downloadDraft" />
      <Button icon="pi pi-code" :label="$t('admin.domainBuilder.exportJs')" :disabled="!validation.ok" @click="downloadSource" />
    </template>

    <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="importDraft" />

    <div class="flex flex-col gap-6">
      <Panel :header="$t('admin.domainBuilder.status')">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.entities') }}</span>
            <strong>{{ draft.entities.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.routes') }}</span>
            <strong>{{ draft.frontendEntities.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.workflows') }}</span>
            <strong>{{ workflowCount }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.summaries') }}</span>
            <strong>{{ draft.summaries.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.validation') }}</span>
            <Tag :severity="validation.ok ? 'success' : 'danger'" :value="validation.ok ? $t('common.success') : validation.issues.length" />
          </div>
        </div>
      </Panel>

      <Message v-if="dirtyJsonKeys.length" severity="warn">
        {{ $t('admin.domainBuilder.invalidJson') }}: {{ dirtyJsonKeys.join(', ') }}
      </Message>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel :header="$t('admin.domainBuilder.entities')">
          <Textarea v-model="entityJson" rows="18" class="w-full font-mono text-xs" @blur="applyJson('entities')" />
        </Panel>

        <Panel :header="$t('admin.domainBuilder.frontendRoutes')">
          <Textarea v-model="frontendJson" rows="18" class="w-full font-mono text-xs" @blur="applyJson('frontendEntities')" />
        </Panel>

        <Panel :header="$t('admin.domainBuilder.workflows')">
          <Textarea v-model="workflowJson" rows="24" class="w-full font-mono text-xs" @blur="applyJson('workflows')" />
        </Panel>

        <Panel :header="$t('admin.domainBuilder.summaries')">
          <Textarea v-model="summaryJson" rows="24" class="w-full font-mono text-xs" @blur="applyJson('summaries')" />
        </Panel>
      </div>

      <Panel :header="$t('admin.domainBuilder.tabs.validation')">
        <Message v-if="validation.ok" severity="success">{{ $t('admin.domainBuilder.valid') }}</Message>
        <div v-else class="flex flex-col gap-2">
          <Message v-for="issue in validation.issues" :key="issue.message" severity="error">
            <span class="font-mono">{{ issue.area }}</span>: {{ issue.message }}
          </Message>
        </div>
        <Divider v-if="validation.warnings.length" />
        <Message v-for="warning in validation.warnings" :key="warning.message" severity="warn">
          <span class="font-mono">{{ warning.area }}</span>: {{ warning.message }}
        </Message>
      </Panel>

      <Panel :header="$t('admin.domainBuilder.tabs.export')">
        <Message v-if="!validation.ok" severity="warn" class="mb-4">
          {{ $t('admin.domainBuilder.exportBlocked') }}
        </Message>
        <Textarea :model-value="generatedSource" readonly rows="26" class="w-full font-mono text-xs" />
      </Panel>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import StandardPage from '~/components/shared/StandardPage.vue';
import { cncEntities, cncFrontendEntities, cncSummaries, cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import {
  DOMAIN_BUILDER_STORAGE_KEY,
  createDomainDraft,
  generateDomainCncSource,
  validateDomainDraft
} from '~/utils/domain-builder.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const fileInput = ref(null);
const dirtyJsonKeys = ref([]);

const sourceDraft = () => createDomainDraft({
  entities: cncEntities,
  frontendEntities: cncFrontendEntities,
  workflows: cncWorkflows,
  summaries: cncSummaries
});

const draft = ref(sourceDraft());
const entityJson = ref('');
const frontendJson = ref('');
const workflowJson = ref('');
const summaryJson = ref('');

const workflowCount = computed(() => Object.keys(draft.value.workflows || {}).length);
const validation = computed(() => validateDomainDraft(draft.value));
const generatedSource = computed(() => generateDomainCncSource(draft.value));

onMounted(() => {
  if (import.meta.client) {
    const saved = localStorage.getItem(DOMAIN_BUILDER_STORAGE_KEY);
    if (saved) {
      try {
        draft.value = JSON.parse(saved);
      } catch {
        draft.value = sourceDraft();
      }
    }
  }
  syncEditorsFromDraft();
});

watch(draft, (value) => {
  if (import.meta.client) localStorage.setItem(DOMAIN_BUILDER_STORAGE_KEY, JSON.stringify(value));
}, { deep: true });

function resetToSource() {
  draft.value = sourceDraft();
  dirtyJsonKeys.value = [];
  syncEditorsFromDraft();
}

function syncEditorsFromDraft() {
  entityJson.value = JSON.stringify(draft.value.entities, null, 2);
  frontendJson.value = JSON.stringify(draft.value.frontendEntities, null, 2);
  workflowJson.value = JSON.stringify(draft.value.workflows, null, 2);
  summaryJson.value = JSON.stringify(draft.value.summaries, null, 2);
}

function applyJson(key) {
  const editorByKey = {
    entities: entityJson,
    frontendEntities: frontendJson,
    workflows: workflowJson,
    summaries: summaryJson
  };
  try {
    draft.value[key] = JSON.parse(editorByKey[key].value);
    dirtyJsonKeys.value = dirtyJsonKeys.value.filter(item => item !== key);
  } catch {
    if (!dirtyJsonKeys.value.includes(key)) dirtyJsonKeys.value.push(key);
  }
}

function triggerImport() {
  fileInput.value?.click();
}

async function importDraft(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  draft.value = JSON.parse(text);
  dirtyJsonKeys.value = [];
  syncEditorsFromDraft();
  event.target.value = '';
}

function downloadDraft() {
  downloadText('domain-cnc-draft.json', JSON.stringify(draft.value, null, 2), 'application/json');
}

function downloadSource() {
  downloadText('domain-cnc.generated.js', generatedSource.value, 'text/javascript');
}

function downloadText(fileName, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
</script>
