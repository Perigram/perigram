<template>
  <img
    v-if="view === 'image' && imageUrl"
    :src="imageUrl"
    :alt="alt"
    class="max-h-[32rem] max-w-full object-contain"
  >
  <Scene2DViewer
    v-else-if="view === 'scene-2d' && scene2dReady"
    :value="value"
    :alt="alt"
  />
  <Scene3DViewer
    v-else-if="view === 'scene-3d' && scene3dReady"
    :value="value"
    :alt="alt"
  />
  <pre v-else-if="view === 'text' && isScalar" class="whitespace-pre-wrap break-words text-supporting">{{ textValue }}</pre>
  <div
    v-else-if="view === 'markdown' && typeof value === 'string'"
    class="text-supporting"
    v-html="renderedMarkdown"
  />
  <div v-else-if="view === 'table' && tableReady" class="overflow-x-auto">
    <table class="w-full text-supporting">
      <thead><tr><th v-for="column in tableColumns" :key="column" class="p-2 text-left">{{ column }}</th></tr></thead>
      <tbody>
        <tr v-for="(row, index) in value" :key="index">
          <td v-for="column in tableColumns" :key="column" class="border-t border-surface p-2">{{ format(row?.[column]) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <a
    v-else-if="view === 'document' && value?.fileId"
    class="text-supporting underline"
    :href="`/api/files/download/${encodeURIComponent(value.fileId)}?bucket=${encodeURIComponent(value.bucket || 'files')}`"
    target="_blank"
    rel="noopener"
  >{{ value.name || alt }}</a>
  <pre v-else class="whitespace-pre-wrap break-all text-supporting">{{ jsonText(value) }}</pre>
</template>

<script setup>
// The one graph-output value renderer (SPEC §28.14): a value renders
// through its best supported view (`utils/graphOutputViews.js` owns the
// order) with raw JSON as the explicit fallback. Every preview surface
// — the graph editor's output panel and the outputs channel — renders
// values through this component.
import { computed } from 'vue';
import { renderMarkdown } from '#shared/markdown.js';
import { graphOutputViews, graphOutputTableColumns } from '~/utils/graphOutputViews.js';
import Scene2DViewer from '~/components/shared/Scene2DViewer.vue';
import Scene3DViewer from '~/components/shared/Scene3DViewer.vue';

const props = defineProps({
  value: { type: null, default: null },
  // 'best' follows the representation contract's order.
  view: { type: String, default: 'best' },
  // The selected output port's declared representation; the standardized
  // scene viewers take precedence over value sniffing.
  representation: { type: String, default: '' },
  alt: { type: String, default: '' }
});

const supportedViews = computed(() => graphOutputViews(props.value, { representation: props.representation }));
const view = computed(() => (props.view === 'best'
  ? supportedViews.value[0]?.value || 'json'
  : props.view));

const imageUrl = computed(() => {
  const value = props.value;
  return value?.fileId && String(value.mime || '').startsWith('image/')
    ? `/api/files/download/${encodeURIComponent(value.fileId)}?bucket=${encodeURIComponent(value.bucket || 'files')}`
    : '';
});
const scene2dReady = computed(() => Array.isArray(props.value?.primitives) && props.value.primitives.length > 0);
const scene3dReady = computed(() => Array.isArray(props.value?.vertices) && props.value.vertices.length > 0);
const isScalar = computed(() => ['string', 'number', 'boolean'].includes(typeof props.value));
const textValue = computed(() => (typeof props.value === 'string' ? props.value : String(props.value)));
const renderedMarkdown = computed(() => renderMarkdown(typeof props.value === 'string' ? props.value : ''));
const tableReady = computed(() => Array.isArray(props.value)
  && props.value.length > 0
  && props.value.every(item => item && typeof item === 'object' && !Array.isArray(item)));
const tableColumns = computed(() => graphOutputTableColumns(props.value));

function format(value) {
  return value === undefined || value === null || typeof value !== 'object' ? String(value) : JSON.stringify(value, null, 2);
}

function jsonText(value) {
  return JSON.stringify(value === undefined ? null : value, null, 2);
}
</script>
