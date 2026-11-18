<template>
  <StandardPage :title="$t('processDesigner.graphsTitle')" :back="back" workspace>
    <div class="flex min-h-0 flex-1 gap-3 overflow-hidden">
      <aside class="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-surface p-2">
        <Button icon="pi pi-plus" :label="$t('processDesigner.newGraph')" size="small" @click="createDraft" />
        <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
        <Message v-else-if="loadError" severity="error">{{ loadError }}</Message>
        <Listbox
          v-else
          :model-value="selectedId"
          :options="documents"
          option-label="name"
          option-value="_id"
          class="min-h-0 w-full flex-1"
          :aria-label="$t('processDesigner.graphsTitle')"
          @update:model-value="selectDocument"
        />
      </aside>
      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface px-3 py-2">
          <InputText
            v-model="nameDraft"
            class="min-w-0"
            :placeholder="$t('processDesigner.graphName')"
            :aria-label="$t('processDesigner.graphName')"
            @keydown.enter.prevent="renameDocument"
          />
          <div class="flex items-center gap-2">
            <span v-if="editorChrome?.dirty" class="text-supporting text-muted">{{ $t('processDesigner.unsaved') }}</span>
            <Button
              icon="pi pi-save"
              :label="$t('common.save')"
              size="small"
              :loading="editorChrome?.saving"
              :disabled="!editorChrome?.save || !editorChrome?.dirty || editorChrome?.saving"
              @click="saveDocument"
            />
            <Button
              v-if="activeRecordId"
              icon="pi pi-check"
              severity="secondary"
              text
              size="small"
              :aria-label="$t('common.rename')"
              :disabled="!nameDraft.trim() || nameDraft.trim() === activeName"
              @click="renameDocument"
            />
          </div>
        </div>
        <GraphEditorSurface
          v-if="editorMounted"
          :key="editorKey"
          :record="selectedRecord"
          :persistence="persistence"
          :page-chrome="pageChrome"
        />
        <StateBlock v-else :message="$t('processDesigner.selectOrCreateGraph')" />
      </section>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Listbox from 'primevue/listbox';
import Message from 'primevue/message';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphEditorSurface from '~/components/process-designer/GraphEditorSurface.vue';
import { usePageBack } from '~/composables/usePageBack.js';

definePageMeta({ layout: 'app', middleware: 'auth' });

const { t } = useI18n();
const toast = useToast();
const { navigation: back } = usePageBack();
const documents = ref([]);
const loading = ref(true);
const loadError = ref('');
const selectedRecord = ref(null);
const selectedId = computed(() => selectedRecord.value?._id || null);
const activeRecordId = ref('');
const activeName = ref('');
const nameDraft = ref('');
const editorChrome = ref(null);
const editorMounted = ref(false);
const editorKey = computed(() => activeRecordId.value || 'new-graph');

const pageChrome = {
  bind(chrome) {
    editorChrome.value = chrome;
    nameDraft.value = chrome.name || nameDraft.value;
    activeName.value = chrome.name || activeName.value;
    editorMounted.value = true;
  }
};

async function loadDocuments() {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await $fetch('/api/instances/graph-document');
    documents.value = (Array.isArray(result) ? result : [])
      .filter(item => item?._id && item?.payload?.fileId)
      .map(item => ({ ...item, _id: String(item._id), name: String(item.name || t('processDesigner.unnamedGraph')) }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  } catch (error) {
    loadError.value = error?.data?.message || error?.message || t('common.error');
  } finally {
    loading.value = false;
  }
}

function createDraft() {
  selectedRecord.value = null;
  activeRecordId.value = '';
  activeName.value = '';
  nameDraft.value = t('processDesigner.newGraph');
  editorChrome.value = null;
  editorMounted.value = true;
}

function selectDocument(id) {
  const record = documents.value.find(item => String(item._id) === String(id));
  if (!record) return;
  selectedRecord.value = record;
  activeRecordId.value = String(record._id);
  activeName.value = record.name;
  nameDraft.value = record.name;
  editorChrome.value = null;
  editorMounted.value = true;
}

async function saveDocument() {
  await editorChrome.value?.save?.();
  if (activeRecordId.value) await loadDocuments();
  if (editorChrome.value?.name) {
    activeName.value = editorChrome.value.name;
    nameDraft.value = editorChrome.value.name;
  }
}

async function renameDocument() {
  const name = nameDraft.value.trim();
  if (!name || !activeRecordId.value || name === activeName.value) return;
  try {
    await editorChrome.value?.rename?.(name);
    activeName.value = name;
    nameDraft.value = name;
    await loadDocuments();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.rename'), detail: error?.data?.message || error?.message || '', life: 4000 });
  }
}

const persistence = {
  async load() {
    if (!activeRecordId.value || !selectedRecord.value?.payload?.fileId) return null;
    return await $fetch(`/api/files/download/${encodeURIComponent(selectedRecord.value.payload.fileId)}?bucket=files`, {
      responseType: 'text'
    });
  },
  async save(payload) {
    const graph = JSON.parse(payload);
    if (!activeRecordId.value) {
      const created = await $fetch('/api/instances/graph-document/editor', {
        method: 'POST',
        body: { name: nameDraft.value.trim() || t('processDesigner.newGraph'), graph }
      });
      activeRecordId.value = String(created._id);
      selectedRecord.value = created;
      activeName.value = created.name || nameDraft.value;
      await loadDocuments();
      return created;
    }
    const file = new Blob([payload], { type: 'application/json' });
    const form = new FormData();
    form.append('file', file, `${nameDraft.value.trim() || activeName.value || 'graph'}.json`);
    const updated = await $fetch(`/api/instances/graph-document/${encodeURIComponent(activeRecordId.value)}/payload`, {
      method: 'PUT',
      body: form
    });
    selectedRecord.value = updated;
    activeName.value = updated.name || activeName.value;
    await loadDocuments();
    return updated;
  },
  async recordExecution(record) {
    if (!activeRecordId.value) return null;
    return await $fetch('/api/graph-executions', {
      method: 'POST',
      body: { graphDocumentInstanceId: activeRecordId.value, record }
    });
  },
  async bakeFile({ graphDocumentInstanceId, record, outputId, destination }) {
    return await $fetch('/api/graph-executions/bake', {
      method: 'POST',
      body: { graphDocumentInstanceId, record, outputId, destination }
    });
  },
  async rename(name) {
    if (!activeRecordId.value) return { name };
    const updated = await $fetch(`/api/instances/graph-document/${encodeURIComponent(activeRecordId.value)}`, {
      method: 'PATCH',
      body: { name }
    });
    selectedRecord.value = updated;
    activeName.value = updated.name || name;
    await loadDocuments();
    return updated;
  }
};

onMounted(loadDocuments);
</script>
