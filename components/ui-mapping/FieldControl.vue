<template>
  <span v-if="outcome.component === 'ValueText'" :class="[densityScale.factValue, LAYOUT.cellText]">{{ displayValue }}</span>
  <p v-else-if="outcome.component === 'ProseText'" class="text-prose line-clamp-4 w-full break-words">{{ model }}</p>
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
  <span v-else-if="outcome.component === 'QuantityText'" :class="densityScale.factValue">{{ quantityValue }}</span>
  <span v-else-if="outcome.component === 'InstantText'" :class="densityScale.factValue">{{ instantValue }}</span>
  <Tag
    v-else-if="outcome.component === 'BooleanIcon'"
    :value="model === true ? '✓' : model === false ? '—' : '·'"
    :severity="model === true ? 'success' : 'secondary'"
  />
  <Tag v-else-if="outcome.component === 'Tag'" :value="enumLabel" severity="secondary" class="max-w-48 truncate" />
  <Knob
    v-else-if="outcome.component === 'Knob'"
    :model-value="percentValue"
    :size="densityScale.knob"
    :stroke-width="8"
    readonly
  />
  <div v-else-if="outcome.component === 'ChipsDisplay'" class="flex min-w-0 flex-wrap items-start gap-1.5">
    <Chip v-for="tag in chipsShown" :key="tag" :label="String(tag ?? fallback)" />
    <Tag v-if="chipsHidden > 0" :value="`+${chipsHidden}`" severity="contrast" />
  </div>
  <InstanceChip v-else-if="outcome.component === 'InstanceChip'" :value="model" :pool="pool" :bundle="bundle" />
  <Chip v-else-if="outcome.component === 'FileChip'" :label="model?.mime || fallback" icon="pi pi-file" />
  <div v-else-if="outcome.component === 'ObjectSummary'" :class="LAYOUT.stackTight">
    <div v-for="entry in summaryEntries" :key="entry.key" :class="LAYOUT.rowBetween">
      <span class="text-supporting text-muted">{{ entry.key }}</span>
      <span class="text-body">{{ entry.value }}</span>
    </div>
  </div>
  <div v-else-if="outcome.component === 'ListSummary'" :class="LAYOUT.stackTight">
    <div v-for="(entry, index) in listEntries" :key="index" :class="LAYOUT.row">
      <i
        v-if="entry.done !== null"
        :class="entry.done ? 'pi pi-check-circle text-status-success' : 'pi pi-minus-circle text-muted'"
      />
      <span class="text-body">{{ entry.label }}</span>
    </div>
    <Tag v-if="listHidden > 0" :value="`+${listHidden}`" severity="contrast" />
  </div>
  <div v-else-if="outcome.component === 'VariantTag'" :class="LAYOUT.row">
    <Tag :value="model?.tag || fallback" severity="info" />
    <span v-if="variantValue" class="text-body">{{ variantValue }}</span>
  </div>

  <InputText v-else-if="outcome.component === 'InputText'" v-model="model" class="w-full" />
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
  <Textarea v-else-if="outcome.component === 'Textarea'" v-model="model" class="w-full" :rows="2" />
  <InputNumber
    v-else-if="outcome.component === 'InputNumber'"
    :model-value="typeof model === 'number' ? model : model?.value ?? null"
    @update:model-value="value => (model = typeof model === 'number' ? value : { value, unit: descriptor.unit })"
    class="w-full"
  />
  <QuantityInput
    v-else-if="outcome.component === 'QuantityInput'"
    v-model="model"
    :unit="descriptor.unit"
  />
  <ToggleSwitch v-else-if="outcome.component === 'ToggleSwitch'" v-model="model" />
  <DatePicker v-else-if="outcome.component === 'DatePicker'" v-model="model" class="w-full" />
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
  <FileUploadControl v-else-if="outcome.component === 'FileUpload'" :payload="payload" />
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
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import DatePicker from 'primevue/datepicker';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Knob from 'primevue/knob';
import { DENSITY, LAYOUT, resolveFieldControl, CHIP_BUDGET, SUMMARY_BUDGET, applyBudget, formatQuantity, formatValue } from '#shared/ui-mapping/index.js';
import InstanceChip from './InstanceChip.vue';
import QuantityInput from './QuantityInput.vue';
import EnumSelect from './EnumSelect.vue';
import InstancePicker from './InstancePicker.vue';
import InstanceMultiPicker from './InstanceMultiPicker.vue';
import ChipsInput from './ChipsInput.vue';
import FileUploadControl from './FileUploadControl.vue';
import ObjectEditor from './ObjectEditor.vue';
import ListEditor from './ListEditor.vue';
import VariantEditor from './VariantEditor.vue';

const props = defineProps({
  descriptor: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const model = defineModel();
const fallback = '—';
const density = inject('uiMappingDensity', 'regular');
const densityScale = computed(() => DENSITY[density.value] || DENSITY.regular);

const outcome = computed(() => resolveFieldControl(props.descriptor, { variant: props.variant }));
const displayValue = computed(() => formatValue({ base: 'string' }, props.modelValue));
const quantityValue = computed(() => formatQuantity(props.modelValue));
const instantValue = computed(() => (props.modelValue ? new Date(props.modelValue).toLocaleDateString() : fallback));
const compactValue = value => formatValue({ base: 'json' }, value) === '—'
  && value !== null && value !== undefined && typeof value === 'object'
  ? firstMeaningful(value)
  : formatValue({ base: 'json' }, value);

const firstMeaningful = value => {
  const first = Object.values(value).find(entry => entry !== null && entry !== undefined);
  if (first === undefined) return fallback;
  return compactValue(first);
};
const summaryEntries = computed(() => {
  const value = props.modelValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return applyBudget(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined),
    SUMMARY_BUDGET
  ).visible.map(([key, entry]) => ({ key: startCase(key), value: compactValue(entry) }));
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
const meterSegments = computed(() => {
  const value = props.modelValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([, entry]) => entry && typeof entry === 'object' && Number.isFinite(entry.value))
    .slice(0, 8)
    .map(([key, entry]) => ({ label: startCase(key), value: Math.max(0, Math.min(100, entry.value)) }));
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
  if (raw && typeof raw === 'object') return formatQuantity(raw);
  return String(sliderValue.value ?? '—');
});
const chartData = computed(() => {
  const value = props.modelValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { labels: [], datasets: [] };
  const entries = Object.entries(value)
    .filter(([, entry]) => entry && typeof entry === 'object' && Number.isFinite(entry.value))
    .slice(0, 10);
  return {
    labels: entries.map(([key]) => startCase(key)),
    datasets: [{
      label: props.descriptor.label || '',
      data: entries.map(([, entry]) => entry.value)
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
