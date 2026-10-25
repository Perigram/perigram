<template>
  <div v-if="variant === 'full'" :class="LAYOUT.stack">
    <SurfaceDetailBody v-bind="detailBodyProps" variant="full" v-on="detailBodyEvents" />
  </div>

  <Card v-else-if="variant === 'detail' && !flattened" class="w-full">
    <template #content>
      <div :class="LAYOUT.stackTight">
        <div :class="LAYOUT.rowBetween">
          <div :class="LAYOUT.row">
            <i :class="glyph" />
            <span class="text-section-heading">{{ instanceLabel }}</span>
          </div>
          <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
        </div>
        <SurfaceDetailBody v-bind="detailBodyProps" variant="detail" v-on="detailBodyEvents" />
      </div>
    </template>
  </Card>

  <div v-else-if="variant === 'detail' && flattened" :class="LAYOUT.stackTight">
    <Divider class="my-0" />
    <div :class="LAYOUT.rowBetween">
      <div :class="LAYOUT.row">
        <i :class="glyph" />
        <span class="text-section-heading">{{ instanceLabel }}</span>
      </div>
      <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
    </div>
    <SurfaceDetailBody v-bind="detailBodyProps" variant="detail" v-on="detailBodyEvents" />
  </div>

  <div v-else :class="['min-w-0', LAYOUT.row]">
    <i :class="glyph" />
    <Button
      v-if="openable"
      link
      :label="instanceLabel"
      :class="LAYOUT.linkClamp"
      @click="$emit('open', instance)"
    />
    <span v-else class="text-body">{{ instanceLabel }}</span>
    <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
    <FieldControl
      v-for="field in shownFields"
      :key="field.name"
      :model-value="instance.fields?.[field.name]"
      :descriptor="field.descriptor"
      variant="inline"
      :pool="pool"
      :bundle="bundle"
    />
    <Tag v-if="hiddenFieldCount > 0" :value="`+${hiddenFieldCount}`" severity="contrast" />
    <InstanceInlineRef
      v-for="ref in rowRefs"
      :key="ref.id"
      :type="String(ref?.type || '')"
      :id="ref?.id"
      :entity="pool?.[ref?.type]?.[ref?.id] || null"
    />
    <Tag v-if="rowHidden > 0" :value="`+${rowHidden}`" severity="contrast" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import { useI18n } from 'vue-i18n';
import { LAYOUT, resolveSurface, applyBudget, ROW_FIELD_BUDGET, titleFor, iconFor, stateDisplayFor, startCaseKey, isIdentifierField } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';
import SurfaceDetailBody from './SurfaceDetailBody.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  parentRole: { type: String, default: null },
  actions: { type: Array, default: () => [] },
  chrome: { type: Object, default: null },
  coveredRelations: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Row identities render as links when an instance-open handler exists
  // upstream (the handful-list projection's rows).
  openable: { type: Boolean, default: false },
  // Per-type state policy map from the compiled process contract.
  statePolicy: { type: Object, default: null }
});

const emit = defineEmits(['run', 'inline-change', 'open', 'open-instance']);

const expanded = ref({});
// One binding set for the detail body across the full, card, and
// flattened-detail chrome branches.
const detailBodyProps = computed(() => ({
  instance: props.instance,
  type: props.type,
  actions: props.actions,
  pool: props.pool,
  bundle: props.bundle,
  expanded: expanded.value,
  coveredRelations: props.coveredRelations,
  editable: props.editable
}));
const flattened = computed(() => (props.chrome ? props.chrome.flattened : props.parentRole === 'card' && props.variant === 'detail'));
const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
const toggleRelation = key => {
  expanded.value[key] = !expanded.value[key];
};
const detailBodyEvents = {
  toggle: toggleRelation,
  run: event => emit('run', event),
  'inline-change': event => emit('inline-change', event),
  'open-instance': target => emit('open-instance', target)
};

const { t } = useI18n();
const instanceLabel = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const glyph = computed(() => iconFor(props.type, props.instance));
const statusValue = computed(() => props.instance?.state || null);
const statusTag = computed(() => {
  if (!statusValue.value) return null;
  const display = stateDisplayFor(props.statePolicy, statusValue.value);
  if (display) return { label: display.label, severity: display.severity };
  // Detail surfaces show the data's state even when the served vocabulary
  // has none for it (the neutral stop-line); list rows render nothing —
  // bulk surfaces speak only the declared vocabulary.
  if (props.variant === 'row' || props.variant === 'inline') return null;
  return { label: startCaseKey(statusValue.value), severity: 'secondary' };
});

// Row fields exclude the identifier — the row's identity link IS the
// identifier value.
const fieldEntries = computed(() => Object.entries(props.type.fields || {})
  .filter(([name]) => !isIdentifierField(props.type, name))
  .map(([name, descriptor]) => ({ name, descriptor })));
const fieldBudget = computed(() => surface.value.budgets.fields
  || (props.variant === 'row' || props.variant === 'inline' ? ROW_FIELD_BUDGET : null));
const fieldOutcome = computed(() => applyBudget(fieldEntries.value, fieldBudget.value));
const shownFields = computed(() => (fieldOutcome.value.mode === 'collapsed' ? fieldOutcome.value.visible : fieldEntries.value));
const hiddenFieldCount = computed(() => (fieldOutcome.value.mode === 'collapsed' ? fieldOutcome.value.hidden : 0));

const rowRelation = computed(() => {
  if (!surface.value.slots.includes('relations')) return { shown: [], hidden: 0 };
  // Per-SLOT budgets (the surface entry's `relations` budget), applied to
  // the first declared relation's refs — the documented budget mechanism.
  const first = Object.values(props.instance.relations || {})[0];
  const list = Array.isArray(first) ? first : first ? [first] : [];
  const outcome = applyBudget(list, surface.value.budgets.relations || null);
  return { shown: outcome.visible, hidden: outcome.hidden };
});
const rowRefs = computed(() => rowRelation.value.shown);
const rowHidden = computed(() => rowRelation.value.hidden);
</script>
