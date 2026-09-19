<template>
  <span v-if="outcome.component === 'ValueText'" class="text-body">{{ displayValue }}</span>
  <span v-else-if="outcome.component === 'QuantityText'" class="text-technical">{{ quantityValue }}</span>
  <span v-else-if="outcome.component === 'InstantText'" class="text-technical">{{ instantValue }}</span>
  <Tag
    v-else-if="outcome.component === 'BooleanIcon'"
    :value="model === true ? '✓' : model === false ? '—' : '·'"
    :severity="model === true ? 'success' : 'secondary'"
  />
  <Tag v-else-if="outcome.component === 'Tag'" :value="enumLabel" severity="secondary" />
  <Knob
    v-else-if="outcome.component === 'Knob'"
    :model-value="percentValue"
    :size="64"
    :stroke-width="8"
    readonly
  />
  <div v-else-if="outcome.component === 'ChipsDisplay'" class="flex flex-wrap items-center gap-1">
    <Chip v-for="tag in chipsShown" :key="tag" :label="tag" />
    <Tag v-if="chipsHidden > 0" :value="`+${chipsHidden}`" severity="contrast" />
  </div>
  <EntityChip v-else-if="outcome.component === 'EntityChip'" :value="model" :pool="pool" :bundle="bundle" />
  <Chip v-else-if="outcome.component === 'FileChip'" :label="model?.mime || fallback" icon="pi pi-file" />
  <span v-else-if="outcome.component === 'ObjectSummary'" class="text-supporting">{{ objectSummary }}</span>
  <span v-else-if="outcome.component === 'ListSummary'" class="text-supporting">{{ listSummary }}</span>
  <Tag v-else-if="outcome.component === 'VariantTag'" :value="model?.tag || fallback" severity="info" />

  <InputText v-else-if="outcome.component === 'InputText'" v-model="model" class="w-full" />
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
  <EntityPicker
    v-else-if="outcome.component === 'EntityPicker'"
    v-model="model"
    :accepts="descriptor.accepts || []"
    :pool="pool"
    :bundle="bundle"
  />
  <EntityMultiPicker
    v-else-if="outcome.component === 'EntityMultiPicker'"
    v-model="model"
    :accepts="descriptor.accepts || []"
    :pool="pool"
    :bundle="bundle"
  />
  <ChipsInput v-else-if="outcome.component === 'ChipsInput'" v-model="model" />
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
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import DatePicker from 'primevue/datepicker';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Knob from 'primevue/knob';
import { resolveFieldControl, CHIP_BUDGET, applyBudget, formatQuantity } from '#shared/ui-mapping/index.js';
import EntityChip from './EntityChip.vue';
import QuantityInput from './QuantityInput.vue';
import EnumSelect from './EnumSelect.vue';
import EntityPicker from './EntityPicker.vue';
import EntityMultiPicker from './EntityMultiPicker.vue';
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

const outcome = computed(() => resolveFieldControl(props.descriptor, { variant: props.variant }));
const displayValue = computed(() => (props.modelValue === null || props.modelValue === undefined ? fallback : String(props.modelValue)));
const quantityValue = computed(() => formatQuantity(props.modelValue));
const instantValue = computed(() => (props.modelValue ? new Date(props.modelValue).toLocaleDateString() : fallback));
const objectSummary = computed(() => {
  if (!props.modelValue || typeof props.modelValue !== 'object') return fallback;
  return Object.entries(props.modelValue)
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${value && typeof value === 'object' ? formatQuantity(value) : String(value)}`)
    .join(' · ');
});
const listSummary = computed(() => (Array.isArray(props.modelValue) ? `${props.modelValue.length}` : fallback));
const percentValue = computed(() => {
  const value = props.modelValue?.value;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
});
const chipsOutcome = computed(() => applyBudget(Array.isArray(props.modelValue) ? props.modelValue : [], CHIP_BUDGET));
const chipsShown = computed(() => chipsOutcome.value.visible);
const chipsHidden = computed(() => chipsOutcome.value.hidden);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const enumLabel = computed(() => (props.modelValue === null || props.modelValue === undefined ? fallback : startCase(props.modelValue)));
const enumOptions = computed(() => (props.descriptor.values || []).map(value => ({ label: startCase(value), value })));
</script>
