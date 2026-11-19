<template>
  <ResponsiveGrid variant="dense" responsive-context="container">
    <Card v-for="instance in instances" :key="instance.id" :class="[LAYOUT.clip, 'w-full']">
      <template #title>
        <div :class="LAYOUT.rowBetween">
          <InstanceIdentity
            :instance="instance"
            :type="type"
            :openable="openable"
            @open="target => $emit('open', target)"
          />
          <Tag v-if="statusOf(instance)" :value="statusOf(instance).label" :severity="statusOf(instance).severity" />
        </div>
      </template>
      <template #content>
        <div :class="LAYOUT.factCell">
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
import { useI18n } from 'vue-i18n';
import { LAYOUT, analyzeTypeShape, formatQuantity, stateDisplayFor } from '#shared/ui-mapping/index.js';
import InstanceIdentity from './InstanceIdentity.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map from the compiled process contract.
  statePolicy: { type: Object, default: null }
});

defineEmits(['open']);

const shape = computed(() => analyzeTypeShape(props.type));
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const { t, locale } = useI18n();
const metricLabel = computed(() => (shape.value.metricField
  ? (props.type.fields[shape.value.metricField].label || startCase(shape.value.metricField))
  : null));
const metricOf = (instance) => {
  const name = shape.value.metricField;
  const value = name ? instance.fields?.[name] : null;
  return value && typeof value === 'object' ? formatQuantity(value, { locale: locale.value }) : (value ?? '—');
};
const statusOf = instance => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
};
</script>
