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
    @update:model-value="key => (model = key ? { type: accepts[0], id: key } : null)"
  />
  <AutoComplete v-else
    :model-value="model"
    :suggestions="suggestions"
    option-label="label"
    force-selection
    dropdown
    fluid
    :complete-on-focus="true"
    class="w-full"
    @complete="search"
    @update:model-value="value => (model = value?.value ?? null)"
  />
</template>

<script setup>
import { computed, ref } from 'vue';
import AutoComplete from 'primevue/autocomplete';
import TreeSelect from 'primevue/treeselect';
import { instanceIdentity } from '#shared/ui-mapping/index.js';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const model = defineModel();
const suggestions = ref([]);

const instanceLabel = instance => {
  const fields = instance.fields || {};
  const identityField = Object.keys(fields).find(key => typeof fields[key] === 'string' && fields[key]);
  return identityField ? fields[identityField] : instance.id;
};
const typeLabel = typeId => (props.bundle?.types || []).find(type => type.id === typeId)?.render?.label || typeId;

const acceptedType = computed(() => (props.bundle?.types || []).find(type => type.id === props.accepts[0]) || null);
const hierarchical = computed(() => Boolean(Object.keys(acceptedType.value?.edges?.children || {}).length));
const buildNode = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = (props.bundle?.types || []).find(candidate => candidate.id === instance.type);
  const children = Object.entries(type?.edges?.children || {}).flatMap(([edgeKey, edge]) => {
    const byId = props.pool[edge.types?.[0]] || {};
    return Object.values(byId).filter(child => !nextSeen.has(child.id) && child.lineage?.[edgeKey]?.id === instance.id);
  });
  return {
    key: instance.id,
    label: instanceIdentity(type, instance),
    children: children.map(child => buildNode(child, nextSeen)).filter(Boolean)
  };
};
const treeOptions = computed(() => hierarchical.value
  ? Object.values(props.pool[props.accepts[0]] || {}).map(instance => buildNode(instance)).filter(Boolean)
  : []);
const treeSelection = computed(() => props.model?.id ?? null);
const options = computed(() => props.accepts
  .flatMap(typeId => Object.values(props.pool[typeId] || {}))
  .map(instance => ({
    label: `${typeLabel(instance.type)}: ${instanceLabel(instance)}`,
    value: { type: instance.type, id: instance.id }
  })));

const search = event => {
  const query = String(event.query || '').toLowerCase();
  suggestions.value = options.value.filter(option => option.label.toLowerCase().includes(query));
};
</script>
