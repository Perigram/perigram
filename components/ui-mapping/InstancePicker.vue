<template>
  <TreeSelect
    v-if="hierarchical"
    :model-value="treeSelection"
    :options="treeOptions"
    option-label="label"
    option-value="key"
    selection-mode="single"
    placeholder="—"
    class="w-full"
    @update:model-value="keys => selectTreeKey(keys)"
  />
  <AutoComplete v-else
    :model-value="selectedOption"
    :suggestions="suggestions"
    option-label="label"
    force-selection
    dropdown
    fluid
    :complete-on-focus="true"
    class="w-full"
    @complete="search"
    @update:model-value="option => (model = option?.value ?? null)"
  />
</template>

<script setup>
import { computed, ref } from 'vue';
import AutoComplete from 'primevue/autocomplete';
import TreeSelect from 'primevue/treeselect';
import { useI18n } from 'vue-i18n';
import { titleFor, childrenOfParent } from '#shared/ui-mapping/index.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const model = defineModel();
const suggestions = ref([]);
const { t, te } = useI18n();
const unnamedLabel = () => t('common.unnamed');

const typeLabel = typeId => generatedEntityLabel(typeId, { t, te });
const typeRecordOf = typeId => (props.bundle?.types || []).find(candidate => candidate.id === typeId) || null;

const acceptedType = computed(() => typeRecordOf(props.accepts[0]));
const hierarchical = computed(() => Boolean(Object.keys(acceptedType.value?.edges?.children || {}).length));
const buildNode = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typeRecordOf(instance.type);
  // Children resolve through the shared hierarchy matcher (declared
  // lineageKey, never the edge's map key) — the same matcher the
  // workspace explorer nests through.
  const children = childrenOfParent(type, props.pool, instance.id)
    .filter(child => !nextSeen.has(child.id));
  return {
    key: instance.id,
    label: titleFor(instance, type, { unnamedLabel: unnamedLabel() }),
    children: children.map(child => buildNode(child, nextSeen)).filter(Boolean)
  };
};
const treeOptions = computed(() => hierarchical.value
  ? Object.values(props.pool[props.accepts[0]] || {}).map(instance => buildNode(instance)).filter(Boolean)
  : []);
// PrimeVue 4 TreeSelect models the selection as a checked-keys map
// (`{ [key]: true }`) in every mode; the model stays the `{ type, id }`
// instance ref.
function selectedTreeKey(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return Object.keys(value).find(key => value[key] === true || value[key]?.checked) || null;
}
function selectTreeKey(keys) {
  const id = selectedTreeKey(keys);
  model.value = id ? { type: props.accepts[0], id } : null;
}
const treeSelection = computed(() => (props.model?.id ? { [props.model.id]: true } : null));
const options = computed(() => props.accepts
  .flatMap(typeId => Object.values(props.pool[typeId] || {}))
  .map(instance => ({
    label: `${typeLabel(instance.type)}: ${titleFor(instance, typeRecordOf(instance.type), { unnamedLabel: unnamedLabel() })}`,
    value: { type: instance.type, id: instance.id }
  })));
const search = event => {
  const query = String(event.query || '').toLowerCase();
  suggestions.value = options.value.filter(option => option.label.toLowerCase().includes(query));
};

// The autocomplete's input label resolves from the option object; the
// model stays the bare `{ type, id }` instance ref, translated here.
const selectedOption = computed(() => options.value.find(option => (
  option.value?.type === props.model?.type && option.value?.id === props.model?.id
)) || null);
</script>
