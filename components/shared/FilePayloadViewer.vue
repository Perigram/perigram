<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-hidden" data-file-payload-viewer :data-viewer-mode="mode">
    <!-- Fetch-backed modes (docx/table/workbook/text) state their fetch:
         a failed download states the error; pdf/image keep their element
         on the download URL when the blob swap fails. -->
    <StateBlock v-if="hasFile && asyncMode && error" state="error" :message="error" />
    <!-- The canvas fills its host: the fixed media region or the card
         stamp. -->
    <DrawingCanvas
      v-else-if="hasFile && ['dxf', 'svg'].includes(mode)"
      :source="fileUrl"
      :source-type="`${mode}-url`"
      mode="card"
      fill
    />
    <DrawingCanvas
      v-else-if="hasFile && mode === 'sketch'"
      :source="fileUrl"
      source-type="sketch"
      mode="card"
      fill
    />
    <!-- The media region contains the raster on its ground; card bands
         crop-fill the stamp. -->
    <img
      v-else-if="hasFile && mode === 'image'"
      :src="blobUrl || fileUrl"
      :class="variant === 'card' ? 'block h-full w-full object-cover' : 'mx-auto block h-full w-full object-contain'"
      :alt="fileName"
    >
    <!-- The card band renders the PDF's first page as a picture (pdf.js
         canvas) — a thumbnail carries no viewer chrome in any browser.
         The pane keeps the viewer: the page fits the frame's width and
         scrolls inside. -->
    <canvas
      v-else-if="hasFile && mode === 'pdf' && variant === 'card' && ready"
      ref="pdfCanvas"
      class="block h-full w-full object-contain"
      :aria-label="fileName || 'PDF'"
    />
    <iframe
      v-else-if="hasFile && mode === 'pdf'"
      :src="pdfSrc"
      class="h-full w-full border-0"
      :title="fileName || 'PDF'"
    />
    <!-- The Word document keeps its own document-native scrolling surface
         (like the table panes); card bands clip it. -->
    <div
      v-else-if="hasFile && mode === 'docx' && ready"
      ref="docxHost"
      :class="variant === 'card' ? 'h-full overflow-hidden bg-white p-4 text-black' : 'h-full overflow-y-auto bg-white p-6 text-black'"
    />
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
    <!-- Text is record prose: it renders as markdown through the shared
         pipeline (shared/markdown.js) under the one element recipe — the
         text preview mode is markdown like the text editor and agent
         answers. Card bands clamp. -->
    <div v-else-if="hasFile && mode === 'text' && ready" :class="variant === 'card' ? 'h-full overflow-hidden p-4 text-prose' : 'text-prose'">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized below -->
      <div
        v-if="renderedMarkdown"
        :class="[MARKDOWN_ELEMENT_CLASSES, 'break-words', variant === 'card' ? [MARKDOWN_COMPACT_CLASS, 'line-clamp-[12]'] : '']"
        v-html="renderedMarkdown"
      />
      <p v-else :class="variant === 'card' ? 'line-clamp-[12] m-0 whitespace-pre-wrap break-words' : 'm-0 whitespace-pre-wrap break-words'">{{ text }}</p>
    </div>
    <svg
      v-else-if="hasFile && mode === 'graph' && ready"
      :viewBox="graphViewBox"
      preserveAspectRatio="xMidYMid meet"
      class="h-full w-full"
      data-graph-payload-preview
    >
      <line
        v-for="edge in graphEdges"
        :key="edge.id"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        stroke="currentColor"
        stroke-width="1.5"
        class="text-muted"
      />
      <g v-for="node in graphNodes" :key="node.id" class="text-muted">
        <rect
          :x="node.x"
          :y="node.y"
          :width="GRAPH_NODE_WIDTH"
          :height="GRAPH_NODE_HEIGHT"
          rx="6"
          fill="var(--p-content-background)"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <text :x="node.x + 8" :y="node.y + 19" fill="currentColor" class="text-[10px]">{{ node.label }}</text>
      </g>
    </svg>
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
import { MARKDOWN_ELEMENT_CLASSES, MARKDOWN_COMPACT_CLASS, renderMarkdown } from '#shared/markdown.js';

// The file-instance payload viewer: `source` is `{ mode, fileUrl,
// attachment }` resolved from the type's payload preview policy
// (file-preview-contract). `variant` names the presentation surface:
// `pane` (default) renders the detail treatment — prose flows at the
// body's measure, the PDF fills the framed region (viewer chrome
// hidden, the page fits the frame's width), bounded media (rasters,
// drawings, tables, Word documents) fill the framed media region; `card` fills its caller's
// fixed-height band with no own border (the host card owns the chrome):
// images and sketch scenes fill at uniform scale (cropped), vector
// drawings fit inside, the PDF renders its first page as a canvas
// thumbnail, tables clip
// their rows, and prose clamps.
const props = defineProps({
  source: { type: Object, required: true },
  variant: { type: String, default: 'pane' }
});
const GRAPH_NODE_WIDTH = 132;
const GRAPH_NODE_HEIGHT = 52;

const docxHost = ref(null);
const text = ref('');
const graphPayload = ref(null);
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
const asyncMode = computed(() => ['docx', 'table', 'workbook', 'text', 'graph'].includes(mode.value)
  || (mode.value === 'pdf' && props.variant === 'card'));
const ready = computed(() => fetchState.value === 'ready');
const pending = computed(() => ['idle', 'loading'].includes(fetchState.value));
// The text preview mode is markdown prose: it renders through the shared
// pipeline like the text editor and agent answers.
const renderedMarkdown = computed(() => (mode.value === 'text' ? renderMarkdown(text.value) : ''));

const graphNodes = computed(() => (Array.isArray(graphPayload.value?.nodes) ? graphPayload.value.nodes : []).map(node => ({
  id: String(node.id || ''),
  x: Number(node.position?.x) || 0,
  y: Number(node.position?.y) || 0,
  label: String(node.config?.label || String(node.operation?.id || '').split('.').pop() || '').slice(0, 18)
})));
const graphNodeById = computed(() => new Map(graphNodes.value.map(node => [node.id, node])));
const graphEdges = computed(() => (Array.isArray(graphPayload.value?.edges) ? graphPayload.value.edges : [])
  .map(edge => {
    const source = graphNodeById.value.get(String(edge.source?.node || ''));
    const target = graphNodeById.value.get(String(edge.target?.node || ''));
    if (!source || !target) return null;
    return {
      id: String(edge.id || `${source.id}-${target.id}`),
      x1: source.x + GRAPH_NODE_WIDTH,
      y1: source.y + GRAPH_NODE_HEIGHT / 2,
      x2: target.x,
      y2: target.y + GRAPH_NODE_HEIGHT / 2
    };
  })
  .filter(Boolean));
const graphViewBox = computed(() => {
  const nodes = graphNodes.value;
  if (!nodes.length) return '0 0 320 180';
  const xs = nodes.flatMap(node => [node.x, node.x + GRAPH_NODE_WIDTH]);
  const ys = nodes.flatMap(node => [node.y, node.y + GRAPH_NODE_HEIGHT]);
  const pad = 16;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return `${minX} ${minY} ${Math.max(...xs) - minX + pad} ${Math.max(...ys) - minY + pad}`;
});
// Modes that need the payload bytes client-side: the readers, the
// blob-backed image swap, and the card's pdf thumbnail.
function needsFetch() {
  if (['docx', 'table', 'workbook', 'text', 'graph', 'image'].includes(mode.value)) return true;
  return mode.value === 'pdf' && props.variant === 'card';
}
// The pane's PDF iframe targets the file URL itself: the viewer params
// ride the URL fragment, and blob URLs ignore fragments.
const pdfSrc = computed(() => {
  if (!fileUrl.value) return '';
  const params = props.variant === 'card'
    ? 'toolbar=0&navpanes=0&scrollbar=0&view=FitH'
    : 'toolbar=0&navpanes=0&view=FitH';
  return `${fileUrl.value}#${params}`;
});

const pdfCanvas = ref(null);
let pdfWorkerPort = null;

// The card's PDF thumbnail: pdf.js paints page one onto the canvas —
// a picture carries no viewer chrome in any browser. A render that
// fails falls back to the param'd iframe below it.
async function renderPdfThumbnail(buffer) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  if (!pdfWorkerPort) {
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    pdfWorkerPort = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = pdfWorkerPort;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 720 / base.width);
  const viewport = page.getViewport({ scale });
  await nextTick();
  const canvas = pdfCanvas.value;
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  const context = canvas.getContext('2d');
  context.scale(dpr, dpr);
  await page.render({ canvasContext: context, viewport }).promise;
}

function releaseBlob() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
}

async function load() {
  releaseBlob();
  text.value = ''; graphPayload.value = null; rows.value = []; columns.value = []; error.value = '';
  fetchState.value = 'idle';
  if (!hasFile.value || ['dxf', 'svg', 'sketch'].includes(mode.value)) return;
    // The payload fetch is relative and client-owned: the server paints
    // the loading state, hydration matches it, the client fetches.
    if (typeof window === 'undefined' || !needsFetch()) return;
    if (asyncMode.value) fetchState.value = 'loading';
  try {
    const response = await fetch(fileUrl.value);
    if (!response.ok) throw new Error(response.statusText);
    if (mode.value === 'text' || mode.value === 'graph') {
      const body = await response.text();
      if (mode.value === 'text') text.value = body;
      else graphPayload.value = JSON.parse(body);
      fetchState.value = 'ready';
      return;
    }
    const buffer = await response.arrayBuffer();
    if (mode.value === 'pdf') {
      fetchState.value = 'ready';
      await renderPdfThumbnail(buffer);
      return;
    }
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
