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
  >
    <template #option="{ node }">
      <div v-if="node.instance" class="pointer-events-none w-full min-w-0">
        <InstanceInlineRef
          :type="node.typeId"
          :entity="node.instance"
          :fetch="false"
          :interactive="false"
          variant="compact"
        />
      </div>
      <span v-else>{{ node.label }}</span>
    </template>
  </TreeSelect>
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
  >
    <template #option="{ option }">
      <div v-if="option.entity" class="pointer-events-none w-full min-w-0">
        <InstanceInlineRef
          :type="option.typeId"
          :entity="option.entity"
          :fetch="false"
          :interactive="false"
          variant="compact"
        />
      </div>
      <span v-else>{{ option.label }}</span>
    </template>
  </AutoComplete>
</template>

<script setup>
import { computed, ref } from 'vue';
import AutoComplete from 'primevue/autocomplete';
import TreeSelect from 'primevue/treeselect';
import { useI18n } from 'vue-i18n';
import { childrenOfParent } from '#shared/ui-mapping/index.js';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { instanceOptionLabel, instancePickerOptions } from '~/utils/instance-select.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const model = defineModel();
const suggestions = ref([]);
const { t, te } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const typeRecordOf = typeId => typesById.value[typeId] || null;

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
    label: instanceOptionLabel(instance, type, { unnamedLabel: t('common.unnamed') }),
    typeId: instance.type,
    instance,
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
const options = computed(() => instancePickerOptions(props.pool, props.accepts, {
  typeRecordFor: typeRecordOf,
  typeLabelFor: typeId => generatedEntityLabel(typeId, { t, te }),
  unnamedLabel: t('common.unnamed'),
  refValue: true
}));
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
