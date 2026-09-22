<template>
  <AppSelect
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    :filter="filter"
    class="w-full"
  />
</template>

<script setup>
import { computed } from 'vue';
import AppSelect from '~/components/shared/InstanceSelect.vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  filter: { type: Boolean, default: false }
});

const model = defineModel();
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const options = computed(() => props.options.map(value => ({ label: startCase(value), value })));
</script>
