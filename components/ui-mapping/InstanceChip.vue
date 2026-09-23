<template>
  <Chip v-if="label" :label="label" :icon="icon" class="max-w-48 [&_.p-chip-label]:truncate" />
  <span v-else class="text-muted">{{ fallback }}</span>
</template>

<script setup>
import { computed } from 'vue';
import Chip from 'primevue/chip';
import { useI18n } from 'vue-i18n';
import { titleFor, iconFor } from '#shared/ui-mapping/index.js';

const props = defineProps({
  value: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const { t } = useI18n();
const fallback = '—';
const instance = computed(() => (props.value ? props.pool?.[props.value.type]?.[props.value.id] : null));
const type = computed(() => (props.bundle?.types || []).find(candidate => candidate.id === props.value?.type) || null);
const label = computed(() => {
  if (!props.value) return null;
  if (!instance.value) return props.value.id;
  return titleFor(instance.value, type.value, { unnamedLabel: t('common.unnamed') });
});
const icon = computed(() => iconFor(type.value, instance.value));
</script>
