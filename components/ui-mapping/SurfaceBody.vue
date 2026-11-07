<template>
  <div v-if="variant === 'full'" :class="LAYOUT.stack">
    <SurfaceDetailBody v-bind="detailBodyProps" variant="full" v-on="detailBodyEvents">
      <template #document-section="scope">
        <slot name="document-section" v-bind="scope" />
      </template>
    </SurfaceDetailBody>
  </div>

  <Card v-else class="w-full">
    <template #content>
      <div :class="LAYOUT.stackTight">
        <div :class="LAYOUT.rowBetween">
          <InstanceIdentity
            :instance="instance"
            :type="type"
            text-class="text-section-heading"
          />
          <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
        </div>
        <SurfaceDetailBody v-bind="detailBodyProps" variant="detail" v-on="detailBodyEvents" />
      </div>
    </template>
  </Card>
</template>

<script setup>
import { computed, ref } from 'vue';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import { LAYOUT, stateDisplayFor, startCaseKey } from '#shared/ui-mapping/index.js';
import InstanceIdentity from './InstanceIdentity.vue';
import SurfaceDetailBody from './SurfaceDetailBody.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  actions: { type: Array, default: () => [] },
  coveredRelations: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map from the compiled process contract.
  statePolicy: { type: Object, default: null },
  // The depth-0 record treatment (`record` | `peek`), threaded to the
  // detail body.
  presentation: { type: String, default: 'record' },
  // The instance's saved overlay (SPEC §26), threaded to the detail body.
  overlay: { type: Object, default: null },
  // The document's child collection sections (SPEC §26), threaded to the
  // detail body.
  childSections: { type: Array, default: () => [] }
});

const emit = defineEmits(['run', 'inline-change', 'open-instance']);

const expanded = ref({});
// One binding set for the detail body across the full and card branches.
const detailBodyProps = computed(() => ({
  instance: props.instance,
  type: props.type,
  actions: props.actions,
  pool: props.pool,
  bundle: props.bundle,
  expanded: expanded.value,
  coveredRelations: props.coveredRelations,
  editable: props.editable,
  presentation: props.presentation,
  overlay: props.overlay,
  childSections: props.childSections
}));
const toggleRelation = key => {
  expanded.value[key] = !expanded.value[key];
};
const detailBodyEvents = {
  toggle: toggleRelation,
  run: event => emit('run', event),
  'inline-change': event => emit('inline-change', event),
  'open-instance': target => emit('open-instance', target)
};

const statusValue = computed(() => props.instance?.state || null);
const statusTag = computed(() => {
  if (!statusValue.value) return null;
  const display = stateDisplayFor(props.statePolicy, statusValue.value);
  if (display) return { label: display.label, severity: display.severity };
  // Detail surfaces show the data's state even when the served vocabulary
  // has none for it (the neutral stop-line).
  return { label: startCaseKey(statusValue.value), severity: 'secondary' };
});
</script>
