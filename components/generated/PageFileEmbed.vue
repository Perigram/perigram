<template>
  <div class="flex min-w-0 flex-col gap-1 rounded-ui bg-subtle p-3">
    <div class="flex min-w-0 items-center justify-between gap-3">
      <div class="min-w-0">
        <a
          class="break-all text-supporting font-medium underline"
          :href="downloadUrl"
          target="_blank"
          rel="noopener"
        >{{ file.path }}</a>
        <div class="text-supporting text-muted">{{ file.mime }} · {{ formattedSize }}</div>
      </div>
      <a
        class="shrink-0 text-supporting underline"
        :href="downloadUrl"
        :download="file.name"
      >{{ $t('common.download') }}</a>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  file: { type: Object, required: true }
});
const downloadUrl = computed(() => (
  `/api/files/download/${encodeURIComponent(props.file.fileId)}?bucket=files`
));
const formattedSize = computed(() => {
  const size = Number(props.file.size) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
});
</script>
