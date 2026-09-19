<template>
  <div v-if="visible" :class="toolbarClasses">
    <InputText
      v-model="searchModel"
      :size="editorSize"
      :placeholder="$t('uiMapping.searchPlaceholder')"
      class="max-w-56"
      :aria-label="$t('uiMapping.searchPlaceholder')"
    />
    <AppSelect
      v-for="facet in visibleFacets"
      :key="facet.name"
      :model-value="facetsModel[facet.name] ?? null"
      :options="facetOptions(facet)"
      option-label="label"
      option-value="value"
      :placeholder="facet.label"
      show-clear
      :size="editorSize"
      class="max-w-44"
      :aria-label="facet.label"
      @update:model-value="value => setFacet(facet.name, value)"
    />
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import InputText from 'primevue/inputtext';
import { LAYOUT, SEARCH_AT } from '#shared/ui-mapping/index.js';
import AppSelect from '~/components/shared/EntitySelect.vue';

// The collection toolbar: materializes the composed list-controls
// contract (searchKeys, facets over values actually present) above a
// list region. It appears only past the SEARCH_AT budget and owns no
// per-type logic — the region tree carries every decision. Search and
// facet selections are region-owned models applied client-side by
// RegionBlock over the loaded instances. Rhythm (gaps) and control size
// follow the system spacing scale through the injected mapping spacing,
// never hardcoded row classes.
const props = defineProps({
  node: { type: Object, required: true }
});

const searchModel = defineModel('search', { type: String, default: '' });
const facetsModel = defineModel('facets', { type: Object, default: () => ({}) });
const spacing = inject('uiMappingSpacing', null);
const toolbarClasses = computed(() => (spacing ? spacing.toolbar : LAYOUT.row));
const editorSize = computed(() => (spacing ? spacing.editorSize : undefined));

const controls = computed(() => props.node.listControls || null);
const visible = computed(() => Boolean(
  controls.value
  && props.node.surfaceKind === 'list'
  && props.node.instances.length > SEARCH_AT
  && (controls.value.searchKeys.length || controls.value.facets.length)
));
const visibleFacets = computed(() => (controls.value?.facets || []).filter(facet => facet.values.length > 1));

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const facetOptions = facet => facet.values.map(value => ({ label: startCase(value), value }));
function setFacet(name, value) {
  if (value === null || value === undefined) delete facetsModel.value[name];
  else facetsModel.value[name] = value;
}
</script>
