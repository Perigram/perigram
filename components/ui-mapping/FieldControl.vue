<template>
  <span v-if="outcome.component === 'ValueText'" :class="[densityScale.factValue, LAYOUT.cellText, numericValue ? 'text-technical tabular-nums' : '']">{{ displayValue }}</span>
  <p v-else-if="outcome.component === 'ProseText'" class="text-prose line-clamp-4 w-full break-words">{{ formatValue({ base: 'string' }, model, { locale: locale }) }}</p>
  <MeterGroup
    v-else-if="outcome.component === 'MeterGroup'"
    :value="meterSegments"
    class="w-full"
  />
  <Chart
    v-else-if="outcome.component === 'Chart'"
    type="bar"
    :data="chartData"
    :options="chartOptions"
    class="w-full"
  />
  <Rating
    v-else-if="outcome.component === 'Rating'"
    :model-value="ratingValue"
    :stars="(descriptor.values || []).length"
    readonly
  />
  <!-- Measured values carry the mono face: quantities, instants, and
       numbers are read as values, not prose (the sanctioned `technical`
       alias). Prose, labels, and identities stay in the UI face. -->
  <span v-else-if="outcome.component === 'QuantityText'" :class="[densityScale.factValue, 'text-technical tabular-nums']">{{ quantityValue }}</span>
  <span v-else-if="outcome.component === 'InstantText'" :class="[densityScale.factValue, 'text-technical tabular-nums']">{{ instantValue }}</span>
  <!-- SPEC §22.8: a boolean renders as the checkbox state it is —
       checked, unchecked, indeterminate — with no glyph characters. -->
  <Checkbox
    v-else-if="outcome.component === 'BooleanCheck'"
    :model-value="model === true"
    :indeterminate="model !== true && model !== false"
    binary
    readonly
  />
  <Tag v-else-if="outcome.component === 'Tag'" :value="enumLabel" severity="secondary" class="max-w-48 truncate" />
  <Knob
    v-else-if="outcome.component === 'Knob'"
    :model-value="percentValue"
    :size="densityScale.knob"
    :stroke-width="8"
    readonly
  />
  <div v-else-if="outcome.component === 'ChipsDisplay'" class="flex min-w-0 flex-wrap items-center gap-2">
    <Chip v-for="tag in chipsShown" :key="tag" :label="String(tag ?? fallback)" />
    <Tag v-if="chipsHidden > 0" :value="`+${chipsHidden}`" severity="contrast" />
  </div>
  <template v-else-if="outcome.component === 'InstanceInlineRef'">
    <InstanceInlineRef
      v-if="refValue"
      :type="String(refValue.type || '')"
      :id="refValue.id ?? null"
      :revision="refValue.revision ?? null"
      :entity="pool?.[refValue.type]?.[refValue.id] || null"
    />
  </template>
  <FileChip v-else-if="outcome.component === 'FileChip'" :file="model" @open="openPayload" />
  <div v-else-if="outcome.component === 'ObjectSummary'" :class="LAYOUT.row">
    <span
      v-for="entry in summaryEntries"
      :key="entry.key"
      class="inline-flex min-w-0 items-baseline gap-1"
    >
      <span class="text-supporting text-muted">{{ entry.key }}</span>
      <InstanceInlineRef
        v-if="entry.ref"
        :type="entry.ref.type"
        :id="entry.ref.id"
        :revision="entry.ref.revision ?? null"
        :entity="pool?.[entry.ref.type]?.[entry.ref.id] || null"
      />
      <span v-else class="min-w-0 truncate text-body">{{ entry.value }}</span>
    </span>
  </div>
  <div v-else-if="outcome.component === 'ListSummary'" :class="LAYOUT.row">
    <span
      v-for="(entry, index) in listEntries"
      :key="index"
      class="inline-flex min-w-0 items-center gap-1"
    >
      <i
        v-if="entry.done !== null"
        :class="entry.done ? 'pi pi-check-circle text-status-success' : 'pi pi-minus-circle text-muted'"
      />
      <span class="min-w-0 truncate text-body">{{ entry.label }}</span>
    </span>
    <Tag v-if="listHidden > 0" :value="`+${listHidden}`" severity="contrast" />
  </div>
  <div v-else-if="outcome.component === 'VariantTag'" :class="LAYOUT.row">
    <Tag :value="model?.tag || fallback" severity="info" />
    <span v-if="variantValue" class="text-body">{{ variantValue }}</span>
  </div>

  <InputText v-else-if="outcome.component === 'InputText'" v-model="model" :size="editorSize" class="w-full" />
  <div v-else-if="outcome.component === 'ColorPicker'" :class="LAYOUT.row" class="w-full">
    <ColorPicker v-model="model" :aria-label="label" />
    <InputText v-model="model" :size="editorSize" class="flex-1" />
  </div>
  <div v-else-if="outcome.component === 'Slider'" :class="LAYOUT.row" class="w-full">
    <Slider
      :model-value="sliderValue"
      :min="descriptor.min"
      :max="descriptor.max"
      :step="sliderStep"
      class="w-full"
      @update:model-value="value => (model = sliderWrite(value))"
    />
    <span class="text-technical w-16 text-right">{{ sliderLabel }}</span>
  </div>
  <Textarea v-else-if="outcome.component === 'Textarea'" v-model="model" :size="editorSize" class="w-full" :rows="2" />
  <InputNumber
    v-else-if="outcome.component === 'InputNumber'"
    :model-value="typeof model === 'number' ? model : model?.value ?? null"
    @update:model-value="value => (model = numericControlWrite(descriptor, model, value))"
    class="w-full"
  />
  <QuantityInput
    v-else-if="outcome.component === 'QuantityInput'"
    v-model="model"
    :unit="descriptor.unit"
  />
  <ToggleSwitch v-else-if="outcome.component === 'ToggleSwitch'" v-model="model" />
  <DatePicker v-else-if="outcome.component === 'DatePicker'" v-model="model" :size="editorSize" class="w-full" />
  <SelectButton
    v-else-if="outcome.component === 'SelectButton'"
    v-model="model"
    :options="enumOptions"
    option-label="label"
    option-value="value"
    :allow-empty="false"
  />
  <EnumSelect
    v-else-if="outcome.component === 'Select'"
    v-model="model"
    :options="descriptor.values || []"
    :filter="outcome.props.filter === true"
  />
  <InstancePicker
    v-else-if="outcome.component === 'InstancePicker'"
    v-model="model"
    :accepts="descriptor.accepts || []"
    :pool="pool"
    :bundle="bundle"
  />
  <InstanceMultiPicker
    v-else-if="outcome.component === 'InstanceMultiPicker'"
    v-model="model"
    :accepts="descriptor.accepts || []"
    :pool="pool"
    :bundle="bundle"
  />
  <ChipsInput v-else-if="outcome.component === 'ChipsInput'" v-model="model" />
  <OrderList
    v-else-if="outcome.component === 'OrderList'"
    :model-value="model || []"
    :options="descriptor.itemType?.values || []"
    option-label="label"
    option-value="value"
    data-key="value"
    class="w-full"
    @update:model-value="value => (model = value)"
  />
  <FileUploadControl v-else-if="outcome.component === 'FileUpload'" v-model="model" :payload="payload" />
  <MapEditor
    v-else-if="outcome.component === 'MapEditor'"
    v-model="model"
    :descriptor="descriptor"
    :variant="variant"
    :pool="pool"
    :bundle="bundle"
    :payload="payload"
  />
  <ObjectEditor
    v-else-if="outcome.component === 'ObjectEditor'"
    v-model="model"
    :descriptor="descriptor"
    :pool="pool"
    :bundle="bundle"
    :payload="payload"
  />
  <ListEditor
    v-else-if="outcome.component === 'ListEditor'"
    v-model="model"
    :descriptor="descriptor"
    :pool="pool"
    :bundle="bundle"
    :payload="payload"
  />
  <VariantEditor
    v-else-if="outcome.component === 'VariantEditor'"
    v-model="model"
    :descriptor="descriptor"
    :pool="pool"
    :bundle="bundle"
    :payload="payload"
  />
  <span v-else class="text-muted">{{ fallback }}</span>
</template>

<script setup>
import { computed, inject } from 'vue';
import InputText from 'primevue/inputtext';
import ColorPicker from 'primevue/colorpicker';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Checkbox from 'primevue/checkbox';
import DatePicker from 'primevue/datepicker';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Knob from 'primevue/knob';
import MeterGroup from 'primevue/metergroup';
import Chart from 'primevue/chart';
import Rating from 'primevue/rating';
import Slider from 'primevue/slider';
import OrderList from 'primevue/orderlist';
import { LAYOUT, resolveFieldControl, CHIP_BUDGET, SUMMARY_BUDGET, applyBudget, formatQuantity, formatValue, numericControlWrite } from '#shared/ui-mapping/index.js';
import { designTokens } from '~/assets/tokens/index.js';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import FileChip from '../shared/FileChip.vue';
import QuantityInput from './QuantityInput.vue';
import EnumSelect from './EnumSelect.vue';
import InstancePicker from './InstancePicker.vue';
import InstanceMultiPicker from './InstanceMultiPicker.vue';
import ChipsInput from './ChipsInput.vue';
import FileUploadControl from './FileUploadControl.vue';
import ObjectEditor from './ObjectEditor.vue';
import MapEditor from './MapEditor.vue';
import ListEditor from './ListEditor.vue';
import VariantEditor from './VariantEditor.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  descriptor: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  // The type's quantitative dominance (typeIsQuantitative): earns the
  // dashboard presentations (SPEC §22.8).
  quantitative: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const model = defineModel();
const { locale } = useI18n();
function openPayload() {
  const fileId = props.modelValue?.fileId;
  if (!fileId || typeof window === 'undefined') return;
  window.open(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`, '_blank');
}
const fallback = '—';
const spacing = inject('uiMappingSpacing', null);
const densityScale = computed(() => ({ factValue: 'text-body', knob: spacing ? spacing.knob : 64 }));
const editorSize = computed(() => (spacing ? spacing.editorSize : undefined));

const outcome = computed(() => resolveFieldControl(props.descriptor, { variant: props.variant, quantitative: props.quantitative }));
// Ref values normalize through the one app resolver: alternate id keys
// (`instanceId`, `_id`, `value`), bare ids, and typeless refs resolve
// against the descriptor's first accepted type — the chip renders the
// record, and the revision channel passes through.
const refValue = computed(() => {
  const value = props.modelValue;
  if (value === null || value === undefined || value === '') return null;
  const [normalized] = resolveInstanceRelationRefs(value, { typeId: props.descriptor?.accepts?.[0] || null });
  if (!normalized) return null;
  return {
    type: normalized.typeId,
    id: normalized.id,
    revision: value && typeof value === 'object' ? (value.revision ?? null) : null
  };
});
const displayValue = computed(() => formatValue({ base: 'string' }, props.modelValue, { locale: locale.value }));
// Plain number fields land on ValueText too: the numeric face applies to
// them, string fields keep the UI face.
const numericValue = computed(() => props.descriptor?.base === 'number');
const quantityValue = computed(() => formatQuantity(props.modelValue, { locale: locale.value }));
const instantValue = computed(() => (props.modelValue ? new Date(props.modelValue).toLocaleDateString(locale.value) : fallback));
const compactValue = value => formatValue({ base: 'json' }, value, { locale: locale.value }) === '—'
  && value !== null && value !== undefined && typeof value === 'object'
  ? firstMeaningful(value)
  : formatValue({ base: 'json' }, value, { locale: locale.value });

const firstMeaningful = value => {
  const first = Object.values(value).find(entry => entry !== null && entry !== undefined);
  if (first === undefined) return fallback;
  return compactValue(first);
};
// Summary entries chip their ref subfields through the same resolver
// the ref dispatch rides.
const summaryRefOf = entry => {
  const [normalized] = resolveInstanceRelationRefs(entry, { typeId: null });
  return normalized ? { type: normalized.typeId, id: normalized.id } : null;
};
const summaryEntries = computed(() => {
  const value = props.modelValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return applyBudget(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined),
    SUMMARY_BUDGET
  ).visible.map(([key, entry]) => ({
    key: startCase(key),
    value: compactValue(entry),
    ref: summaryRefOf(entry)
  }));
});
const listEntries = computed(() => {
  const items = Array.isArray(props.modelValue) ? props.modelValue : [];
  const outcome = applyBudget(items, SUMMARY_BUDGET);
  return outcome.visible.map(item => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const values = Object.values(item);
      const done = values.find(value => typeof value === 'boolean');
      const label = values.find(value => typeof value === 'string')
        ?? values.find(value => value && typeof value === 'object' && Number.isFinite(value.value));
      return { done: done === undefined ? null : done, label: compactValue(label) };
    }
    return { done: null, label: compactValue(item) };
  });
});
const listHidden = computed(() => {
  const items = Array.isArray(props.modelValue) ? props.modelValue : [];
  return applyBudget(items, SUMMARY_BUDGET).hidden;
});
// Meter bars are DOM spans — PrimeVue paints backgroundColor from each
// item's color, so segments cycle the PrimeVue palette CSS vars (theme
// reactive in both modes). Chart bars draw on a canvas where CSS
// variables do not resolve, so charts take concrete colors from the
// canonical design-token palette source instead.
const METER_COLORS = Object.freeze([
  'var(--p-cyan-500)',
  'var(--p-orange-500)',
  'var(--p-violet-500)',
  'var(--p-emerald-500)',
  'var(--p-blue-500)',
  'var(--p-pink-500)',
  'var(--p-amber-500)',
  'var(--p-teal-500)'
]);
const meterSegments = computed(() => {
  const value = props.modelValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([, entry]) => entry && typeof entry === 'object' && Number.isFinite(entry.value))
    .slice(0, 8)
    .map(([key, entry], index) => ({
      label: startCase(key),
      value: Math.max(0, Math.min(100, entry.value)),
      color: METER_COLORS[index % METER_COLORS.length]
    }));
});
const sliderValue = computed(() => {
  const raw = props.modelValue;
  const number = raw && typeof raw === 'object' ? raw.value : raw;
  return Number.isFinite(number) ? number : (props.descriptor.min ?? 0);
});
const sliderStep = computed(() => {
  const span = (props.descriptor.max ?? 1) - (props.descriptor.min ?? 0);
  return span > 100 ? 5 : span > 10 ? 1 : 0.1;
});
const sliderWrite = value => (props.modelValue && typeof props.modelValue === 'object'
  ? { value, unit: props.modelValue.unit }
  : value);
const sliderLabel = computed(() => {
  const raw = props.modelValue;
  if (raw && typeof raw === 'object') return formatQuantity(raw, { locale: locale.value });
  return String(sliderValue.value ?? '—');
});
const chartData = computed(() => {
  const value = props.modelValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { labels: [], datasets: [] };
  const entries = Object.entries(value)
    .filter(([, entry]) => entry && typeof entry === 'object' && Number.isFinite(entry.value))
    .slice(0, 10);
  const primary = designTokens.palette.primary;
  return {
    labels: entries.map(([key]) => startCase(key)),
    datasets: [{
      label: props.descriptor.label || '',
      data: entries.map(([, entry]) => entry.value),
      backgroundColor: primary[400],
      borderColor: primary[600],
      borderWidth: 1
    }]
  };
});
const chartOptions = Object.freeze({ plugins: { legend: { display: false } } });
const ratingValue = computed(() => {
  const index = (props.descriptor.values || []).indexOf(props.modelValue);
  return index >= 0 ? index + 1 : 0;
});
const variantValue = computed(() => {
  const value = compactValue(props.modelValue?.value);
  return value === fallback ? '' : value;
});
const percentValue = computed(() => {
  const value = props.modelValue?.value;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
});
const chipsOutcome = computed(() => applyBudget(Array.isArray(props.modelValue) ? props.modelValue : [], CHIP_BUDGET));
const chipsShown = computed(() => chipsOutcome.value.visible);
const chipsHidden = computed(() => chipsOutcome.value.hidden);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const enumLabel = computed(() => {
  const value = props.modelValue;
  if (value === null || value === undefined || typeof value === 'object') return fallback;
  return startCase(value);
});
const enumOptions = computed(() => (props.descriptor.values || []).map(value => ({ label: startCase(value), value })));
</script>
