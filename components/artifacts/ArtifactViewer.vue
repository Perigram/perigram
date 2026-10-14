<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-hidden" data-artifact-viewer :data-viewer-mode="mode">
    <DrawingCanvas
      v-if="hasFile && ['dxf', 'svg'].includes(mode)"
      :source="fileUrl"
      :source-type="`${mode}-url`"
      :mode="variant === 'card' ? 'card' : 'viewer'"
      :fill="variant === 'card'"
      :show-layer-panel="variant !== 'card'"
    />
    <DrawingCanvas
      v-else-if="hasFile && mode === 'sketch'"
      :source="fileUrl"
      source-type="sketch"
      :mode="variant === 'card' ? 'card' : 'viewer'"
      :fill="variant === 'card'"
    />
    <img v-else-if="hasFile && mode === 'image'" :src="blobUrl || fileUrl" :class="variant === 'card' ? 'block h-full w-full object-cover' : 'mx-auto block max-h-full max-w-full object-contain'" :alt="artifactName">
    <iframe v-else-if="hasFile && mode === 'pdf'" :src="blobUrl || fileUrl" class="h-full w-full border-0" :title="artifactName || 'PDF'" />
    <!-- The Word document keeps its own document-native scrolling surface
         (like the PDF iframe); every other mode fits its bounds without a
         scroll container. -->
    <div v-else-if="hasFile && mode === 'docx'" ref="docxHost" class="h-full overflow-y-auto bg-white p-6 text-black" />
    <TableFrame v-else-if="hasFile && ['table', 'workbook'].includes(mode) && rows.length">
      <DataTable :value="rows" :rows="TABLE_PAGE_ROWS" paginator size="small">
        <Column v-for="column in columns" :key="column" :field="column" :header="column" />
      </DataTable>
    </TableFrame>
    <!-- Text previews read in prose; markdown renders through the
         shared pipeline (shared/markdown.js), plain text keeps breaks. -->
    <div v-else-if="hasFile && mode === 'text'" class="h-full overflow-hidden p-4 text-prose">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized below -->
      <div v-if="renderedText" class="line-clamp-[12] break-words" v-html="renderedText" />
      <p v-else class="line-clamp-[12] m-0 whitespace-pre-wrap break-words">{{ text }}</p>
    </div>
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
import { TABLE_PAGE_ROWS } from '#shared/ui-mapping/index.js';
import { isMarkdownDocument, renderMarkdown } from '#shared/markdown.js';

import { resolveArtifactViewer } from '~/utils/artifact-viewer.js';

// `artifact`/`revision` drive the artifact-entity path. Callers without an
// artifact record (CTS file instances) pass an explicit `source`
// `{ mode, fileUrl, attachment }` resolved from the type's preview policy.
// `variant` names the presentation surface in the canvas-mode vocabulary:
// `pane` (default) keeps the pan/zoom viewer canvas and its layer panel;
// `card` renders the non-interactive canvas that fills its caller's
// fixed-height band with no own border (the host card owns the chrome):
// images and sketch scenes fill it at uniform scale (cropped), vector
// drawings (dxf/svg/occs) fit inside it, and dimension text renders big.
const props = defineProps({
  artifact: { type: Object, default: null },
  revision: { type: Object, default: null },
  source: { type: Object, default: null },
  variant: { type: String, default: 'pane' }
});
const docxHost = ref(null);
const text = ref('');
const rows = ref([]);
const columns = ref([]);
const error = ref('');
const blobUrl = ref('');
const viewer = computed(() => {
  if (props.source) {
    const fileUrl = props.source.fileUrl || '';
    return { attachment: props.source.attachment || null, fileUrl, hasFile: Boolean(fileUrl), mode: props.source.mode || 'download' };
  }
  return resolveArtifactViewer({ artifact: props.artifact, revision: props.revision });
});
const mode = computed(() => viewer.value.mode);
const hasFile = computed(() => viewer.value.hasFile);
const fileUrl = computed(() => viewer.value.fileUrl);
const artifactName = computed(() => props.artifact?.identity?.name
  || props.source?.attachment?.name
  || '');
const mimeType = computed(() => props.source?.attachment?.mime
  || props.revision?.attachments?.primary?.metadata?.mimeType
  || props.artifact?.attachments?.primary?.metadata?.mimeType
  || 'application/octet-stream');
const isMarkdown = computed(() => isMarkdownDocument({ mimeType: mimeType.value, name: artifactName.value }));
const renderedText = computed(() => renderMarkdown(text.value));

function releaseBlob() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
}

async function load() {
  releaseBlob();
  text.value = ''; rows.value = []; columns.value = []; error.value = '';
  if (!hasFile.value) return;
    if (['dxf', 'svg', 'sketch'].includes(mode.value)) return;
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
    blobUrl.value = URL.createObjectURL(new Blob([buffer], { type: mimeType.value }));
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
