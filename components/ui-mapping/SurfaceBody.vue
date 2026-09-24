<template>
  <div v-if="variant === 'full'" :class="LAYOUT.stack">
    <SurfaceDetailBody
      :instance="instance"
      :type="type"
      variant="full"
      :actions="actions"
      :pool="pool"
      :bundle="bundle"
      :expanded="expanded"
      :covered-relations="coveredRelations"
      :editable="editable"
      :editing="editing"
      :draft="draft"
      @toggle="toggleRelation"
      @run="$emit('run', $event)"
      @inline-change="$emit('inline-change', $event)"
    />
  </div>

  <Card v-else-if="variant === 'detail' && !flattened" class="w-full">
    <template #content>
      <div :class="LAYOUT.stackTight">
        <div :class="LAYOUT.rowBetween">
          <div class="flex flex-wrap items-center gap-2">
            <i :class="glyph" />
            <span class="text-section-heading">{{ instanceLabel }}</span>
          </div>
          <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
        </div>
        <SurfaceDetailBody
          :instance="instance"
          :type="type"
          variant="detail"
          :actions="actions"
          :pool="pool"
          :bundle="bundle"
          :expanded="expanded"
          @toggle="toggleRelation"
          @run="$emit('run', $event)"
        />
      </div>
    </template>
  </Card>

  <div v-else-if="variant === 'detail' && flattened" :class="LAYOUT.stackTight">
    <Divider class="my-0" />
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div :class="LAYOUT.row">
        <i :class="glyph" />
        <span class="text-section-heading">{{ instanceLabel }}</span>
      </div>
      <Tag v-if="statusTag" :value="statusTag.label" :severity="statusTag.severity" />
    </div>
      <SurfaceDetailBody
        :instance="instance"
        :type="type"
        variant="detail"
        :actions="actions"
        :pool="pool"
        :bundle="bundle"
        :expanded="expanded"
        :covered-relations="coveredRelations"
        :editable="editable"
        :editing="editing"
        :draft="draft"
        @toggle="toggleRelation"
        @run="$emit('run', $event)"
        @inline-change="$emit('inline-change', $event)"
      />
  </div>

  <div v-else class="flex min-w-0 flex-wrap items-center gap-2">
    <i :class="glyph" />
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
    <InstanceChip v-for="ref in rowRefs" :key="ref.id" :value="ref" :pool="pool" :bundle="bundle" />
    <Tag v-if="rowHidden > 0" :value="`+${rowHidden}`" severity="contrast" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import { useI18n } from 'vue-i18n';
import { LAYOUT, resolveSurface, applyBudget, ROW_FIELD_BUDGET, SEVERITY_MAP, titleFor, iconFor } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InstanceChip from './InstanceChip.vue';
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
  editing: { type: Boolean, default: false },
  draft: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

defineEmits(['run', 'inline-change']);

const expanded = ref({});
const flattened = computed(() => (props.chrome ? props.chrome.flattened : props.parentRole === 'card' && props.variant === 'detail'));
const surface = computed(() => resolveSurface(props.type, { variant: props.variant }));
const toggleRelation = key => {
  expanded.value[key] = !expanded.value[key];
};

const { t } = useI18n();
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const instanceLabel = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const glyph = computed(() => iconFor(props.type, props.instance));
const statusValue = computed(() => props.instance.states?.main);
const statusTag = computed(() => {
  if (!statusValue.value) return null;
  const render = props.type.states?.main?.render?.[statusValue.value];
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
