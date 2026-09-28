<template>
  <DesignerNodeCard :selected="selected" size="md" :shape="shape">
    <!-- Meta rows (scope version, editor tag, field/state counts) live in
         the header tooltip, not on the card face — quiet-card policy
         (process-designer README, "Node UI contract"). -->
    <div v-tooltip.bottom="metaTooltip" class="flex items-center gap-1.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle">
        <i :class="classIcon" aria-hidden="true" />
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">{{ label }}</strong>
      <Tag :value="classOf" severity="secondary" />
    </div>
    <DesignerSocketHandle :socket="inputSpec" side="left" handle-id="input:declare" />
    <DesignerSocketHandle :socket="outputSpec" side="right" handle-id="output:type" />
  </DesignerNodeCard>
</template>

<script setup>
// Type declaration node (SPEC §20/§21 slice B): declares/children wires
// attach here; fields and states wire into it.
import { computed } from 'vue';
import Tag from 'primevue/tag';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
  // Population shape passthrough (node UI contract): the process canvas
  // renders this family as the dashed declaration vocabulary; the type
  // canvas passes nothing and keeps the neutral default frame.
  shape: { type: String, default: '' }
});

const label = computed(() => props.data.label || props.data.typeId || 'type');
const classOf = computed(() => props.data.class || 'file');
const scope = computed(() => props.data.scope || 'org');
const version = computed(() => props.data.version || 1);
const editor = computed(() => props.data.editor || null);
const fieldCount = computed(() => Number(props.data.fieldCount) || 0);
const stateCount = computed(() => Number(props.data.stateCount) || 0);
const metaTooltip = computed(() => ({
  value: [
    scope.value === 'system' ? `v${version.value}` : null,
    editor.value,
    fieldCount.value ? `${fieldCount.value} fields` : null,
    stateCount.value ? `${stateCount.value} states` : null
  ].filter(Boolean).join(' · ') || label.value
}));
const inputSpec = computed(() => props.data.inputSpecs?.[0] || {});
const outputSpec = computed(() => props.data.outputSpecs?.[0] || {});
const classIcon = computed(() => ({
  file: 'pi pi-file',
  item: 'pi pi-box',
  group: 'pi pi-folder',
  process: 'pi pi-cog'
}[classOf.value] || 'pi pi-database'));
</script>
