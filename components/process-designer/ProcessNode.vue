<template>
  <!-- Cards are socket manifests, not inline editors: typed values and
       operation configuration live in the inspector; the canvas keeps
       identity, diagnostics, preview visibility, and named socket rows. -->
  <DesignerNodeCard :selected="selected" :faulted="faulted" size="lg" :primary="isOperation" :title="data.purpose || data.summary || ''">
    <!-- Collapsed: one header line — the name and its icons between the
         socket rails; every socket centered on the card's top/bottom
         EDGE at a distinct position (names on the handle tooltips). The
         zero-height rails cancel the card padding, so percentage
         positions span the card's full width and the handle's -50%
         translate centers its dot on the border. -->
    <div v-if="collapsed" class="relative -mx-2.5 -mt-3 h-0">
      <span
        v-for="(input, index) in collapseInputs"
        :key="`ci-${input.id}`"
        class="absolute top-0 block h-0 w-[26px] -translate-x-1/2"
        :style="{ left: `${((index + 1) * 100) / (collapseInputs.length + 1)}%` }"
      >
        <DesignerSocketHandle :socket="input" side="top" :title="socketTitle(input)" />
      </span>
    </div>
    <div class="flex items-center gap-1.5">
      <Button
        :icon="collapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"
        text
        rounded
        size="small"
        severity="secondary"
        class="nodrag -ml-1.5 shrink-0"
        :title="collapsed ? $t('processDesigner.expandNode') : $t('processDesigner.collapseNode')"
        :aria-label="collapsed ? $t('processDesigner.expandNode') : $t('processDesigner.collapseNode')"
        @mousedown.stop
        @click.stop="toggleCollapsed"
      />
      <div v-tooltip.bottom="nodeSpecTooltip" class="min-w-0 flex-1">
        <div v-if="data.groupLabel && !collapsed" class="truncate text-supporting text-muted">{{ data.groupLabel }}</div>
        <div class="flex min-w-0 items-center gap-2">
          <i v-if="data.processNodeGlyph"  :class="processNodeGlyphClass(data.processNodeGlyph)" class="shrink-0 text-muted" aria-hidden="true" />
          <strong class="block min-w-0 truncate text-label">{{ data.kindLabel || record.kind }}</strong>
        </div>
      </div>
      <Button
        v-if="nodeSpecTooltip.value"
        icon="pi pi-info-circle"
        text
        rounded
        size="small"
        severity="secondary"
        class="nodrag shrink-0"
        :aria-label="$t('processDesigner.nodeDescription')"
        @mousedown.stop
        @click.stop
      />
      <Button
        v-if="faulted"
        icon="pi pi-exclamation-circle"
        text
        rounded
        size="small"
        severity="danger"
        class="nodrag shrink-0"
        :aria-label="$t('processDesigner.nodeErrors')"
        @mousedown.stop
        @click.stop="errorPopover?.toggle($event)"
      />
      <Popover ref="errorPopover" append-to="body">
        <div class="flex max-w-22rem flex-col gap-1 text-supporting text-status-danger">
          <span v-for="message in faultMessages" :key="message" class="overflow-wrap-anywhere">{{ message }}</span>
        </div>
      </Popover>
      <Button
        v-if="dataOutputs.length"
        :icon="previewVisible ? 'pi pi-eye' : 'pi pi-eye-slash'"
        :class="previewVisible ? 'text-muted' : 'text-status-info'"
        text
        rounded
        size="small"
        class="nodrag -mr-1.5 shrink-0"
        :title="previewVisible ? $t('processDesigner.previewNodeHide') : $t('processDesigner.previewNodeShow')"
        :aria-label="previewVisible ? $t('processDesigner.previewNodeHide') : $t('processDesigner.previewNodeShow')"
        @mousedown.stop
        @click.stop="togglePreviewVisible"
      />
    </div>
    <div v-if="collapsed" class="relative -mx-2.5 -mb-2.5 h-0">
      <span
        v-for="(output, index) in collapseOutputs"
        :key="`co-${output.id}`"
        class="absolute top-0 block h-0 w-[26px] -translate-x-1/2"
        :style="{ left: `${((index + 1) * 100) / (collapseOutputs.length + 1)}%` }"
      >
        <DesignerSocketHandle :socket="output" side="bottom" :title="socketTitle(output)" />
      </span>
    </div>

    <div v-if="socketRows.length && !collapsed" class="-mx-2.5 mt-2 flex flex-col">
      <!-- One-sided rows render without their empty opposite cell; row
           labels ALWAYS render and carry the socket contract on hover
           (type · access) — the row itself stays the name (node UI
           contract). -->
      <div v-for="row in socketRows" :key="row.key" class="flex min-h-7 items-center gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <DesignerSocketHandle :socket="row.input" side="left" :title="socketTitle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
        </div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <DesignerSocketHandle :socket="row.output" side="right" :title="socketTitle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
      </div>
    </div>

    <!-- The event section renders an effect's event sockets as ordinary
         socket rows (node UI contract): wired or manual reads from
         whether a wire is attached. -->
    <div v-if="eventSocketRows.length && !collapsed" class="-mx-2.5 mt-3">
      <div v-for="row in eventSocketRows" :key="row.key" class="flex min-h-7 items-center gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <DesignerSocketHandle :socket="row.input" side="left" :title="socketTitle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
        </div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <DesignerSocketHandle :socket="row.output" side="right" :title="socketTitle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
      </div>
    </div>
  </DesignerNodeCard>
</template>

<script setup>
import { operationKindOf } from '@perigram/cts';

import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import {
  EFFECT_SPECIES_KINDS,
  formatProcessType } from '@perigram/processes';
import { socketSpecLine } from '~/composables/useNodeSpec.js';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const record = computed(() => props.data.processNodeRecord || props.data);
const opKind = computed(() => operationKindOf(record.value || {}));
const isOperation = computed(() => EFFECT_SPECIES_KINDS.has(opKind.value));
const inputSpecs = computed(() => normalizeSpecs(record.value.inputs || props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(record.value.outputs || props.data.outputSpecs || []));
const dataInputs = computed(() => inputSpecs.value.filter(input => input.role === 'data'));
const dataOutputs = computed(() => outputSpecs.value.filter(output => output.role === 'data'));
const eventInputs = computed(() => inputSpecs.value.filter(input => input.role !== 'data'));
const eventOutputs = computed(() => outputSpecs.value.filter(output => output.role !== 'data'));
const socketRows = computed(() => alignSockets(dataInputs.value, dataOutputs.value, 'data'));

// The header tooltip (quiet-card policy): what the node does + what its
// sockets expect and output — the node-spec summary the removed `?`
// affordance used to surface (SPEC §8/§20 vocabulary, presentation only).
const nodeSpecTooltip = computed(() => {
  const sections = [];
  if (dataInputs.value.length) {
    sections.push(`Expects: ${dataInputs.value.map(input => socketSpecLine(input, formatProcessType)).join(' • ')}`);
  }
  if (dataOutputs.value.length) {
    sections.push(`Outputs: ${dataOutputs.value.map(output => socketSpecLine(output, formatProcessType)).join(' • ')}`);
  }
  return { value: sections.join(' — ') };
});

// Node-scoped diagnostics (SPEC §28): the card carries its anchored
// messages — the fault border, the header glyph, and the leading message
// rows; the socket-spec tooltip stays available on an unfaulted card.
const faultMessages = computed(() => (Array.isArray(props.data.diagnostics) ? props.data.diagnostics : null));
const faulted = computed(() => Boolean(faultMessages.value?.length));
const errorPopover = ref(null);
const eventSocketRows = computed(() => alignSockets(eventInputs.value, eventOutputs.value, 'event'));
// The collapsed card's edge sockets: every socket, data and event alike.
const collapseInputs = computed(() => [...dataInputs.value, ...eventInputs.value]);
const collapseOutputs = computed(() => [...dataOutputs.value, ...eventOutputs.value]);
const collapsed = computed(() => Boolean(props.data.collapsed));

function toggleCollapsed() {
  props.data.collapsed = !collapsed.value;
}
function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
}

// Per-node preview visibility (SPEC §28): the header eye. An authored
// `previewVisible: false` removes the node's outputs from the preview
// channels; visible stays unauthored.
const previewVisible = computed(() => record.value.previewVisible !== false);

function togglePreviewVisible() {
  update({ previewVisible: previewVisible.value ? false : null });
}

function normalizeSpecs(items) {
  return items.map((item, index) => ({
    ...item,
    id: item.id || item.label || index,
    label: item.label || item.id || String(index),
    base: item.type?.base || 'json',
    type: item.type || {},
    role: item.role || 'data',
    typeLabel: formatProcessType(item.type)
  }));
}

function alignSockets(inputs, outputs, prefix) {
  return Array.from({ length: Math.max(inputs.length, outputs.length) }, (_, index) => ({
    key: `${prefix}-${inputs[index]?.id || ''}-${outputs[index]?.id || ''}-${index}`,
    input: inputs[index] || null,
    output: outputs[index] || null
  }));
}

function socketTitle(item) {
  return [item.label, item.typeLabel, item.access && item.access !== 'item' ? item.access : '', item.description]
    .filter(Boolean).join(' · ');
}

function socketClass(item, side) {
  return [
    'relative min-w-0 max-w-44 py-1.5',
    side === 'left' ? 'pl-3' : 'ml-auto pr-3 text-right'
  ];
}

</script>
