<template>
  <div v-if="shown" class="flex min-w-0 flex-col gap-2" :class="fill ? 'h-full min-h-0' : 'h-56'">
    <ProgressSpinner v-if="loading" style="width: 1.25rem; height: 1.25rem" />
    <FilePayloadViewer
      v-else-if="blobUrl"
      :source="{ mode: previewMode, fileUrl: blobUrl, attachment }"
      :variant="fill ? 'pane' : 'card'"
      :class="fill ? 'h-full min-h-0' : 'h-56 min-h-0'"
    />
    <DrawingCanvas
      v-else-if="fieldsPreview"
      :source="{ data: fieldsPreview }"
      source-type="geometry-preview"
      mode="card"
      :class="fill ? 'h-full min-h-0' : 'h-56 min-h-0'"
    />
    <ul v-if="failures.length" class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="(failure, index) in failures" :key="index" class="flex items-center gap-2 text-supporting text-status-danger">
        <i class="pi pi-exclamation-circle" />
        <span>{{ [failure.name, failure.message].filter(Boolean).join(' — ') }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import FilePayloadViewer from '~/components/shared/FilePayloadViewer.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';

// The fill dialog's composed preview (SPEC §24): the create's own
// construction service over the live draft, persisting nothing. A 404/403
// (no binding, no grant) keeps the pane quiet.
const props = defineProps({
  typeId: { type: String, required: true },
  mode: { type: String, required: true },
  type: { type: Object, default: null },
  draft: { type: Object, default: () => ({}) },
  // The create's required rows are filled; an incomplete draft never
  // reaches the service.
  ready: { type: Boolean, default: true },
  // Fill the composed pane instead of the fixed-height band.
  fill: { type: Boolean, default: false }
});

const loading = ref(false);
const blobUrl = ref('');
const fieldsPreview = ref(null);
const attachment = ref(null);
const failures = ref([]);
const bound = ref(true);
const emit = defineEmits(['meta']);
const previewMode = computed(() => props.type?.payload?.preview || 'attachment');

const draftKey = computed(() => JSON.stringify(props.draft || {}));
const hasDraft = computed(() => draftKey.value !== '{}');

const shown = computed(() => props.ready && bound.value && (
  hasDraft.value || Boolean(blobUrl.value) || Boolean(fieldsPreview.value) || loading.value
));

function releaseBlob() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
}

let timer = null;
let sequence = 0;

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  releaseBlob();
});

watch([draftKey, () => props.ready], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, 350);
}, { immediate: true });

async function run() {
  if (!props.ready || !hasDraft.value) {
    sequence += 1;
    releaseBlob();
    fieldsPreview.value = null;
    attachment.value = null;
    failures.value = [];
    loading.value = false;
    return;
  }
  const ticket = ++sequence;
  loading.value = true;
  failures.value = [];
  try {
    const result = await $fetch(`/api/instances/${encodeURIComponent(props.typeId)}/construction-preview`, {
      method: 'POST',
      body: { mode: props.mode, draft: props.draft }
    });
    if (ticket !== sequence) return;
    if (result == null) {
      bound.value = false;
      releaseBlob();
      fieldsPreview.value = null;
      attachment.value = null;
      return;
    }
    bound.value = true;
    emit('meta', result.meta || null);
    releaseBlob();
    const payload = result?.payload || null;
    fieldsPreview.value = payload?.base64 ? null : (result?.fields || null);
    if (payload?.base64) {
      const bytes = Uint8Array.from(atob(payload.base64), char => char.charCodeAt(0));
      blobUrl.value = URL.createObjectURL(new Blob([bytes], { type: payload.mime || 'application/octet-stream' }));
      attachment.value = { name: payload.name || '', mime: payload.mime || '', size: bytes.length };
    } else {
      attachment.value = null;
    }
  } catch (error) {
    if (ticket !== sequence) return;
    if (error?.statusCode === 404 || error?.statusCode === 403) {
      bound.value = false;
      releaseBlob();
      fieldsPreview.value = null;
      attachment.value = null;
      return;
    }
    releaseBlob();
    fieldsPreview.value = null;
    attachment.value = null;
    // A structured refusal names its offenders; any other failure carries
    // the transport's message — the pane stays honest about what it could
    // not compose.
    failures.value = Array.isArray(error?.data?.failures)
      ? error.data.failures
      : [{ message: error?.data?.message || error?.message || String(error) }];
  } finally {
    if (ticket === sequence) loading.value = false;
  }
}
</script>
