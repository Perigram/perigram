<template>
  <Chip v-if="label" :label="label" :icon="icon" />
  <span v-else class="text-muted">{{ fallback }}</span>
</template>

<script setup>
import { computed } from 'vue';
import Chip from 'primevue/chip';

const props = defineProps({
  value: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const fallback = '—';
const instance = computed(() => (props.value ? props.pool?.[props.value.type]?.[props.value.id] : null));
const type = computed(() => (props.bundle?.types || []).find(candidate => candidate.id === props.value?.type) || null);
const label = computed(() => {
  if (!props.value) return null;
  const fields = instance.value?.fields || {};
  return fields.serial || fields.title || fields.grade || fields.name || fields.summary || props.value.id;
});
const icon = computed(() => type.value?.render?.icon || 'pi pi-circle');
</script>
