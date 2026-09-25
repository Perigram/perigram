<template>
  <span
    v-if="display"
    class="inline-flex min-w-0 max-w-full items-center gap-1"
    :title="value"
  >
    <template v-for="(segment, index) in display.segments" :key="`${segment}-${index}`">
      <i
        v-if="index > 0"
        class="pi pi-angle-right shrink-0 text-muted"
        aria-hidden="true"
      />
      <Tag
        v-if="index < display.segments.length - 1"
        :value="labelOf(segment)"
        severity="secondary"
        class="min-w-0 shrink-0"
      >
        <span class="min-w-0 truncate">{{ labelOf(segment) }}</span>
      </Tag>
    </template>
    <Tag
      :severity="display.severity"
      :icon="display.icon || undefined"
      class="min-w-0"
    >
      <span class="min-w-0 truncate">{{ display.label }}</span>
    </Tag>
  </span>
</template>

<script setup>
// The segmented state tag: one materialization of `stateDisplayFor` (the
// mapping contract's flat-vocabulary resolver). A flat value renders as a
// single Tag; a dotted value (declaration-era tree paths, nested machine
// states) renders as a path — muted ancestor segments with angle
// separators, the leaf styled by the authored severity/icon. The raw value
// stays in the title as the debugging channel. A value the served policy
// does not know still renders as the neutral stop-line: the detail header
// shows the data's truth even when the vocabulary has moved on.
import { computed } from 'vue';
import Tag from 'primevue/tag';
import { stateDisplayFor, stateSegmentsOf } from '#shared/ui-mapping/index.js';

const props = defineProps({
  value: { type: String, default: '' },
  // The region's per-type state policy map (contract.statePolicy[typeId]).
  policy: { type: Object, default: null }
});

const startCase = segment => String(segment).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const labelOf = segment => startCase(segment);

const display = computed(() => {
  const resolved = stateDisplayFor(props.policy, props.value);
  if (resolved) return resolved;
  const segments = stateSegmentsOf(props.value);
  if (!segments.length) return null;
  return {
    segments,
    label: labelOf(segments[segments.length - 1]),
    severity: 'secondary',
    icon: null,
    known: false
  };
});
</script>
