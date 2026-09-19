<template>
  <ResponsiveGrid variant="dense" responsive-context="container">
    <Card v-for="instance in instances" :key="instance.id" :class="[LAYOUT.clip, 'w-full']">
      <template #title>
        <div :class="LAYOUT.rowBetween">
          <div :class="LAYOUT.row">
            <i :class="type?.render?.icon || 'pi pi-circle'" class="text-muted" />
            <span>{{ identityOf(instance) }}</span>
          </div>
          <Tag v-if="statusOf(instance)" :value="statusOf(instance).label" :severity="statusOf(instance).severity" />
        </div>
      </template>
      <template #subtitle>{{ type?.render?.label }}</template>
      <template #content>
        <div class="flex flex-col items-start gap-1">
          <span class="text-metric">{{ metricOf(instance) }}</span>
          <span v-if="metricLabel" class="text-supporting text-muted">{{ metricLabel }}</span>
        </div>
      </template>
    </Card>
  </ResponsiveGrid>
</template>

<script setup>
import { computed } from 'vue';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import { LAYOUT, analyzeTypeShape, instanceIdentity, formatQuantity, SEVERITY_MAP } from '#shared/ui-mapping/index.js';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const shape = computed(() => analyzeTypeShape(props.type));
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => instanceIdentity(props.type, instance);
const metricLabel = computed(() => (shape.value.metricField
  ? (props.type.fields[shape.value.metricField].label || startCase(shape.value.metricField))
  : null));
const metricOf = (instance) => {
  const name = shape.value.metricField;
  const value = name ? instance.fields?.[name] : null;
  return value && typeof value === 'object' ? formatQuantity(value) : (value ?? '—');
};
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
</script>
