<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-hidden" data-file-payload-viewer :data-viewer-mode="mode">
    <!-- Pages and tables read in sized panes alone; a fixed-height card
         band carries the file chip. Text clamps below. -->
    <div v-if="hasFile && cardFactsBand" class="flex h-full w-full items-center justify-center">
      <FileChip :file="attachment" />
    </div>
    <DrawingCanvas
      v-else-if="hasFile && ['dxf', 'svg'].includes(mode)"
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
    <img v-else-if="hasFile && mode === 'image'" :src="blobUrl || fileUrl" :class="variant === 'card' ? 'block h-full w-full object-cover' : 'mx-auto block max-h-full max-w-full object-contain'" :alt="fileName">
    <iframe v-else-if="hasFile && mode === 'pdf'" :src="blobUrl || fileUrl" class="h-full w-full border-0" :title="fileName || 'PDF'" />
    <!-- The Word document keeps its own document-native scrolling surface
         (like the PDF iframe). -->
    <div v-else-if="hasFile && mode === 'docx'" ref="docxHost" class="h-full overflow-y-auto bg-white p-6 text-black" />
    <TableFrame v-else-if="hasFile && ['table', 'workbook'].includes(mode) && rows.length" class="h-full">
      <DataTable :value="rows" :rows="TABLE_PAGE_ROWS" paginator size="small" scrollable scroll-height="flex">
        <Column v-for="column in columns" :key="column" :field="column" :header="column" />
      </DataTable>
    </TableFrame>
    <!-- Text previews read in prose; markdown renders through the
         shared pipeline (shared/markdown.js), plain text keeps breaks.
         Card bands clamp; sized panes scroll. -->
    <div v-else-if="hasFile && mode === 'text'" :class="variant === 'card' ? 'h-full overflow-hidden p-4 text-prose' : 'h-full overflow-y-auto p-4 text-prose'">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized below -->
      <div v-if="renderedText" :class="variant === 'card' ? 'line-clamp-[12] break-words' : 'break-words'" v-html="renderedText" />
      <p v-else :class="variant === 'card' ? 'line-clamp-[12] m-0 whitespace-pre-wrap break-words' : 'm-0 whitespace-pre-wrap break-words'">{{ text }}</p>
    </div>
    <StateBlock v-else-if="!hasFile" state="empty" :message="$t('file.previewUnavailable')" />
    <StateBlock v-else-if="error" state="error" :message="error" />
    <StateBlock v-else state="empty" :message="$t('file.previewUnavailable')" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import FileChip from '~/components/shared/FileChip.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { TABLE_PAGE_ROWS, DOCUMENT_PREVIEW_MODES } from '#shared/ui-mapping/index.js';
import { isMarkdownDocument, renderMarkdown } from '#shared/markdown.js';

// The file-instance payload viewer: `source` is `{ mode, fileUrl,
// attachment }` resolved from the type's payload preview policy
// (file-preview-contract). `variant` names the presentation surface in
// the canvas-mode vocabulary: `pane` (default) keeps the pan/zoom viewer
// canvas and its layer panel; `card` renders the non-interactive canvas
// that fills its caller's fixed-height band with no own border (the
// host card owns the chrome): images and sketch scenes fill it at
// uniform scale (cropped), vector drawings (dxf/svg) fit inside it, and
// dimension text renders big. Document modes (pdf/docx/table/workbook)
// render readers in sized panes and the file chip in card bands.
const props = defineProps({
  source: { type: Object, required: true },
  variant: { type: String, default: 'pane' }
});
const docxHost = ref(null);
const text = ref('');
const rows = ref([]);
const columns = ref([]);
const error = ref('');
const blobUrl = ref('');
const mode = computed(() => props.source.mode || 'download');
const hasFile = computed(() => Boolean(props.source.fileUrl));
const attachment = computed(() => props.source.attachment || null);
const fileUrl = computed(() => props.source.fileUrl || '');
const fileName = computed(() => props.source?.attachment?.name || '');
const mimeType = computed(() => props.source?.attachment?.mime || 'application/octet-stream');
const cardFactsBand = computed(() => props.variant === 'card'
  && DOCUMENT_PREVIEW_MODES.includes(mode.value)
  && mode.value !== 'text');
const isMarkdown = computed(() => isMarkdownDocument({ mimeType: mimeType.value, name: fileName.value }));
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
    if (cardFactsBand.value) return;
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
