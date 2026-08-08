<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-auto">
    <DrawingCanvas
      v-if="hasFile && ['dxf', 'svg'].includes(mode)"
      :source="fileUrl"
      :source-type="`${mode}-url`"
      mode="viewer"
      show-layer-panel
    />
    <img v-else-if="hasFile && mode === 'image'" :src="blobUrl || fileUrl" class="mx-auto block max-h-full max-w-full object-contain" :alt="artifact.identity?.name || ''">
    <iframe v-else-if="hasFile && mode === 'pdf'" :src="blobUrl || fileUrl" class="h-full min-h-[32rem] w-full border-0" :title="artifact.identity?.name || 'PDF'" />
    <div v-else-if="hasFile && mode === 'docx'" ref="docxHost" class="min-h-[32rem] bg-white p-6 text-black" />
    <TableFrame v-else-if="hasFile && ['table', 'workbook'].includes(mode) && rows.length">
      <DataTable :value="rows" scrollable scroll-height="flex" size="small">
        <Column v-for="column in columns" :key="column" :field="column" :header="column" />
      </DataTable>
    </TableFrame>
    <pre v-else-if="hasFile && mode === 'text'" class="whitespace-pre-wrap break-words p-4 font-mono text-sm">{{ text }}</pre>
    <StateBlock v-else-if="!hasFile" state="empty" :message="$t('artifacts.previewUnavailable')" />
    <StateBlock v-else-if="error" state="error" :message="error" />
    <StateBlock v-else state="empty" :message="$t('artifacts.previewUnavailable')" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';

const props = defineProps({ artifact: { type: Object, required: true }, revision: { type: Object, default: null } });
const domainUi = useCutkitDomainUi();
const docxHost = ref(null);
const text = ref('');
const rows = ref([]);
const columns = ref([]);
const error = ref('');
const blobUrl = ref('');
const mode = computed(() => domainUi.getAttachmentPreview(props.artifact.data?.type || '').mode);
const hasFile = computed(() => Boolean(props.revision?.attachments?.primary?.fileId || props.artifact.attachments?.primary?.fileId));
const fileUrl = computed(() => !hasFile.value ? '' : props.revision?._id
  ? `/api/entity-revisions/${encodeURIComponent(props.revision._id)}/file`
  : domainUi.getDownloadEndpoint('artifact', props.artifact._id));

function releaseBlob() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
}

async function load() {
  releaseBlob();
  text.value = ''; rows.value = []; columns.value = []; error.value = '';
  if (!hasFile.value) return;
  if (['dxf', 'svg'].includes(mode.value)) return;
  try {
    const response = await fetch(fileUrl.value);
    if (!response.ok) throw new Error(response.statusText);
    if (mode.value === 'text') {
      text.value = await response.text();
      return;
    }
    const buffer = await response.arrayBuffer();
    if (mode.value === 'table' || mode.value === 'workbook') {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headers = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
      columns.value = headers;
      rows.value = values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
      return;
    }
    blobUrl.value = URL.createObjectURL(new Blob([buffer], { type: props.revision?.attachments?.primary?.metadata?.mimeType || props.artifact.attachments?.primary?.metadata?.mimeType }));
    if (mode.value === 'docx') {
      await nextTick();
      const { renderAsync } = await import('docx-preview');
      await renderAsync(buffer, docxHost.value, undefined, { ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true });
    }
  } catch (cause) {
    error.value = cause?.message || String(cause);
  }
}

watch([fileUrl, mode], load, { immediate: true });
onBeforeUnmount(releaseBlob);
</script>
