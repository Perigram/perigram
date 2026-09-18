<template>
  <div v-if="preview.component === 'ImagePreview'" class="flex w-full flex-col gap-1">
    <Image :src="dataUri" :alt="mime" class="w-full rounded-ui" />
    <span class="text-supporting text-muted">{{ mime }}</span>
  </div>
  <div
    v-else-if="preview.component"
    class="text-supporting flex h-24 w-full items-center justify-center gap-2 rounded-ui bg-subtle"
  >
    <i :class="placeholderIcon" />
    <span>{{ mime }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Image from 'primevue/image';
import { resolvePreview } from '#shared/ui-mapping/index.js';

const props = defineProps({
  type: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const preview = computed(() => resolvePreview(props.type || {}));
const mime = computed(() => props.payload?.mime || preview.value.mime[0] || preview.value.mode);
const placeholderIcon = computed(() => ({
  GeometryPreview: 'pi pi-objects-column',
  AttachmentPreview: 'pi pi-file'
}[preview.value.component] || 'pi pi-eye'));
const dataUri = computed(() => `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" rx="8" fill="#f4f4f5"/><circle cx="120" cy="48" r="28" fill="none" stroke="#a1a1aa" stroke-width="2"/><circle cx="120" cy="48" r="4" fill="#a1a1aa"/></svg>'
)}`);
</script>
