<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-hidden" data-file-payload-viewer :data-viewer-mode="mode">
    <!-- Fetch-backed modes (docx/table/workbook/text) state their fetch:
         a failed download states the error; pdf/image keep their element
         on the download URL when the blob swap fails. -->
    <StateBlock v-if="hasFile && asyncMode && error" state="error" :message="error" />
    <!-- The canvas keeps its aspect-driven frame in panes (the drawing
         owns the height) and fills the fixed card band. -->
    <DrawingCanvas
      v-else-if="hasFile && ['dxf', 'svg'].includes(mode)"
      :source="fileUrl"
      :source-type="`${mode}-url`"
      mode="card"
      :fill="variant === 'card'"
    />
    <DrawingCanvas
      v-else-if="hasFile && mode === 'sketch'"
      :source="fileUrl"
      source-type="sketch"
      mode="card"
      :fill="variant === 'card'"
    />
    <!-- Panes show the raster at natural size, contained by the band and
         the viewport; card bands crop-fill the stamp. -->
    <img
      v-else-if="hasFile && mode === 'image'"
      :src="blobUrl || fileUrl"
      :class="variant === 'card' ? 'block h-full w-full object-cover' : 'mx-auto block h-auto w-auto max-h-[80vh] max-w-full object-contain'"
      :alt="fileName"
    >
    <!-- The PDF renders its page shape in panes (MediaBox aspect, A4
     fallback); viewer chrome stays hidden in both variants — the frame
     owns the chrome and the payload download is the escape hatch. -->
    <iframe
      v-else-if="hasFile && mode === 'pdf'"
      :src="pdfSrc"
      :style="variant === 'card' ? undefined : pdfPaneStyle"
      :class="variant === 'card' ? 'h-full w-full border-0' : 'mx-auto block h-auto border-0'"
      :title="fileName || 'PDF'"
    />
    <!-- The Word document keeps its own document-native scrolling surface
         (like the reading prose and table panes). -->
    <div v-else-if="hasFile && mode === 'docx' && ready" ref="docxHost" class="h-full overflow-y-auto bg-white p-6 text-black" />
    <TableFrame v-else-if="hasFile && ['table', 'workbook'].includes(mode) && rows.length" class="h-full">
      <DataTable
        :value="rows"
        :rows="TABLE_PAGE_ROWS"
        :paginator="variant !== 'card'"
        size="small"
        :scrollable="variant !== 'card'"
        :scroll-height="variant !== 'card' ? 'flex' : undefined"
      >
        <Column v-for="column in columns" :key="column" :field="column" :header="column" />
      </DataTable>
    </TableFrame>
    <!-- Text previews read in prose; markdown renders through the shared
         pipeline (shared/markdown.js), plain text keeps breaks.
         Card bands clamp; sized panes scroll. -->
    <div v-else-if="hasFile && mode === 'text' && ready" :class="variant === 'card' ? 'h-full overflow-hidden p-4 text-prose' : 'h-full overflow-y-auto p-4 text-prose'">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized below -->
      <div v-if="renderedMarkdown" :class="variant === 'card' ? 'line-clamp-[12] break-words' : 'break-words'" v-html="renderedMarkdown" />
      <p v-else :class="variant === 'card' ? 'line-clamp-[12] m-0 whitespace-pre-wrap break-words' : 'm-0 whitespace-pre-wrap break-words'">{{ text }}</p>
    </div>
    <StateBlock v-else-if="hasFile && asyncMode && pending" state="loading" />
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
import TableFrame from '~/components/shared/TableFrame.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { TABLE_PAGE_ROWS } from '#shared/ui-mapping/index.js';
import { isMarkdownDocument, renderMarkdown } from '#shared/markdown.js';

// The file-instance payload viewer: `source` is `{ mode, fileUrl,
// attachment }` resolved from the type's payload preview policy
// (file-preview-contract). `variant` names the presentation surface:
// `pane` (default) renders inside the framed media surface with
// content-sized geometry — the aspect-owning drawing frame, the raster
// at natural size, the page-shaped PDF, scrolling prose and paginated
// tables under the reading band; `card` fills its caller's fixed-height
// band with no own border (the host card owns the chrome): images and
// sketch scenes fill at uniform scale (cropped), vector drawings fit
// inside, the PDF page hides viewer chrome, tables clip their rows, and
// prose clamps.
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
const fetchState = ref('idle');
const mode = computed(() => props.source.mode || 'download');
const hasFile = computed(() => Boolean(props.source.fileUrl));
const fileUrl = computed(() => props.source.fileUrl || '');
const fileName = computed(() => props.source?.attachment?.name || '');
const mimeType = computed(() => props.source?.attachment?.mime || 'application/octet-stream');
// Modes whose whole render depends on the payload fetch: they state
// loading and surface a failed download.
const asyncMode = computed(() => ['docx', 'table', 'workbook', 'text'].includes(mode.value));
const ready = computed(() => fetchState.value === 'ready');
const pending = computed(() => ['idle', 'loading'].includes(fetchState.value));
const isMarkdown = computed(() => isMarkdownDocument({ mimeType: mimeType.value, name: fileName.value }));
const renderedMarkdown = computed(() => (isMarkdown.value ? renderMarkdown(text.value) : ''));
// Modes that need the payload bytes client-side: the readers and the
// blob-backed image/pdf swaps.
const FETCHED_MODES = ['pdf', 'docx', 'table', 'workbook', 'text', 'image'];
// A4 portrait stands in until the fetched bytes yield the page's own
// MediaBox ratio.
const A4_ASPECT = 1 / 1.414;
const pdfAspect = ref(A4_ASPECT);
function pageAspect(buffer) {
  try {
    const head = new TextDecoder('iso-8859-1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4 * 1024 * 1024)));
    const match = head.match(/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    const width = match ? Math.abs(Number(match[3]) - Number(match[1])) : 0;
    const height = match ? Math.abs(Number(match[4]) - Number(match[2])) : 0;
    const ratio = width > 0 && height > 0 ? width / height : A4_ASPECT;
    return ratio >= 0.2 && ratio <= 5 ? ratio : A4_ASPECT;
  } catch {
    return A4_ASPECT;
  }
}
const pdfPaneStyle = computed(() => ({
  width: `min(100%, calc(80vh * ${pdfAspect.value.toFixed(4)}))`,
  aspectRatio: String(pdfAspect.value.toFixed(4))
}));
const pdfSrc = computed(() => {
  const url = blobUrl.value || fileUrl.value;
  return url ? `${url}#toolbar=0&navpanes=0` : url;
});

function releaseBlob() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
}

async function load() {
  releaseBlob();
  text.value = ''; rows.value = []; columns.value = []; error.value = '';
  fetchState.value = 'idle';
  if (!hasFile.value || ['dxf', 'svg', 'sketch'].includes(mode.value)) return;
    // The payload fetch is relative and client-owned: the server paints
    // the loading state, hydration matches it, the client fetches.
    if (typeof window === 'undefined' || !FETCHED_MODES.includes(mode.value)) return;
    if (asyncMode.value) fetchState.value = 'loading';
  try {
    const response = await fetch(fileUrl.value);
    if (!response.ok) throw new Error(response.statusText);
    if (mode.value === 'text') {
      text.value = await response.text();
      fetchState.value = 'ready';
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
      fetchState.value = 'ready';
      return;
    }
    blobUrl.value = URL.createObjectURL(new Blob([buffer], { type: mimeType.value }));
    if (mode.value === 'pdf') pdfAspect.value = pageAspect(buffer);
    if (mode.value === 'docx') {
      fetchState.value = 'ready';
      await nextTick();
      const { renderAsync } = await import('docx-preview');
      await renderAsync(buffer, docxHost.value, undefined, { ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true });
    }
  } catch (cause) {
    if (asyncMode.value) {
      error.value = cause?.message || String(cause);
      fetchState.value = 'error';
    }
  }
}

watch([fileUrl, mode], load, { immediate: true });
onBeforeUnmount(releaseBlob);
</script>
