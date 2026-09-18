<template>
  <Panel v-if="variant === 'full'" class="w-full">
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <i :class="type.render.icon" />
        <span class="text-section-heading">{{ instanceLabel }}</span>
        <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
      </div>
    </template>
    <SurfaceDetailBody
      :instance="instance"
      :type="type"
      variant="full"
      :pool="pool"
      :bundle="bundle"
      :expanded="expanded"
      @toggle="toggleRelation"
    />
  </Panel>

  <Card v-else-if="variant === 'detail' && !flattened" class="w-full">
    <template #content>
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <i :class="type.render.icon" />
            <span class="text-section-heading">{{ instanceLabel }}</span>
          </div>
          <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
        </div>
        <SurfaceDetailBody
          :instance="instance"
          :type="type"
          variant="detail"
          :pool="pool"
          :bundle="bundle"
          :expanded="expanded"
          @toggle="toggleRelation"
        />
      </div>
    </template>
  </Card>

  <div v-else-if="variant === 'detail' && flattened" class="flex flex-col gap-3">
    <Divider class="my-0" />
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <i :class="type.render.icon" />
        <span class="text-section-heading">{{ instanceLabel }}</span>
      </div>
      <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
    </div>
    <SurfaceDetailBody
      :instance="instance"
      :type="type"
      variant="detail"
      :pool="pool"
      :bundle="bundle"
      :expanded="expanded"
      @toggle="toggleRelation"
    />
  </div>

  <div v-else class="flex flex-wrap items-center gap-2">
    <i :class="type.render.icon" />
    <span class="text-body">{{ instanceLabel }}</span>
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
    <EntityChip v-for="ref in rowRefs" :key="ref.id" :value="ref" :pool="pool" :bundle="bundle" />
    <Tag v-if="rowHidden > 0" :value="`+${rowHidden}`" severity="contrast" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Panel from 'primevue/panel';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import { resolveSurface, applyBudget, ROW_FIELD_BUDGET, SEVERITY_MAP } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import EntityChip from './EntityChip.vue';
import SurfaceDetailBody from './SurfaceDetailBody.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  parentRole: { type: String, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const expanded = ref({});
const flattened = computed(() => props.parentRole === 'card' && props.variant === 'detail');
const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
const toggleRelation = key => {
  expanded.value[key] = !expanded.value[key];
};

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const instanceLabel = computed(() => {
  const fields = props.instance.fields || {};
  return fields.serial || fields.title || fields.grade || fields.name || fields.summary || props.instance.id;
});
const statusValue = computed(() => props.instance.states?.main);
const statusTag = computed(() => {
  if (!statusValue.value) return null;
  const render = props.type.render?.states?.[statusValue.value];
  return {
    label: render?.label || startCase(statusValue.value),
    severity: SEVERITY_MAP[render?.severity] || 'secondary'
  };
});

const fieldEntries = computed(() => Object.entries(props.type.fields || {}).map(([name, descriptor]) => ({ name, descriptor })));
const fieldBudget = computed(() => surface.value.budgets.fields
  || (props.variant === 'row' || props.variant === 'inline' ? ROW_FIELD_BUDGET : null));
const fieldOutcome = computed(() => applyBudget(fieldEntries.value, fieldBudget.value));
const shownFields = computed(() => (fieldOutcome.value.mode === 'collapsed' ? fieldOutcome.value.visible : fieldEntries.value));
const hiddenFieldCount = computed(() => (fieldOutcome.value.mode === 'collapsed' ? fieldOutcome.value.hidden : 0));

const rowRelation = computed(() => {
  if (!surface.value.slots.includes('relations')) return { shown: [], hidden: 0 };
  const first = Object.values(props.instance.relations || {})[0];
  const list = Array.isArray(first) ? first : first ? [first] : [];
  const budget = surface.value.budgets[Object.keys(props.instance.relations || {})[0]];
  const outcome = applyBudget(list, budget);
  return { shown: outcome.visible, hidden: outcome.hidden };
});
const rowRefs = computed(() => rowRelation.value.shown);
const rowHidden = computed(() => rowRelation.value.hidden);
</script>
