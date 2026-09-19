<template>
  <AutoComplete
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
