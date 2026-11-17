<template>
  <div class="my-2 rounded-lg border border-surface p-3">
    <div v-if="!result" class="text-sm text-muted">Loading reference…</div>
    <div v-else-if="result.status !== 'resolved'" class="text-sm text-muted">
      Referenced item is {{ result.reason === 'missing' ? 'missing' : 'unavailable' }}
    </div>
    <template v-else>
      <div class="mb-2 flex items-center gap-2">
        <span class="font-medium">{{ title }}</span>
        <span class="text-xs text-muted">{{ result.mode === 'pinned' ? 'Pinned revision' : 'Live reference' }}</span>
      </div>
      <div v-if="snapshot" class="text-sm text-muted">
        <div v-for="(value, key) in previewFields" :key="key" class="flex gap-2">
          <span class="shrink-0">{{ key }}</span>
          <span class="min-w-0 truncate">{{ displayValue(value) }}</span>
        </div>
      </div>
      <div v-else-if="instance" class="text-sm text-muted">
        {{ instance.type }} · {{ instance._id || instance.id }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  result: { type: Object, default: null }
});
const instance = computed(() => props.result?.instance || null);
const snapshot = computed(() => props.result?.revision?.data?.snapshot || null);
const title = computed(() => snapshot.value?.name || instance.value?.name || instance.value?.fields?.name || props.result?.typeId || 'Reference');
const previewFields = computed(() => {
  const fields = snapshot.value?.fields || instance.value?.fields || {};
  return Object.fromEntries(Object.entries(fields).slice(0, 4));
});
function displayValue(value) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return Array.isArray(value) ? value.map(item => typeof item === 'object' ? '[item]' : String(item)).join(', ') : '[value]';
}
</script>
