<template>
  <div v-if="searchOpen || filtersOpen" :class="toolbarClasses">
    <InputText
      v-if="searchOpen"
      v-model="searchModel"
      :size="editorSize"
      :placeholder="$t('uiMapping.searchPlaceholder')"
      class="max-w-56"
      :aria-label="$t('uiMapping.searchPlaceholder')"
    />
    <template v-if="filtersOpen">
      <FilterBuilder
        class="w-full"
        :model-value="filterModel"
        :fields="builderFields"
        @update:model-value="value => (filterModel = value)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import InputText from 'primevue/inputtext';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import FilterBuilder from '~/components/shared/FilterBuilder.vue';

// The collection toolbar's controls: the search input and facet selects
// render only while their header toggles are open (RegionBlock owns the
// toggle buttons and the one-line header contract). It materializes the
// composed list-controls contract (searchKeys, facets over values
// actually present) and owns no per-type logic — the region tree carries
// every decision. Search and facet selections are region-owned models
// applied client-side by RegionBlock over the loaded instances: a facet
// holds a value set (multi-select within one facet, conjunction across
// facets). Rhythm (gaps) and control size follow the system spacing
// scale through the injected mapping spacing, never hardcoded row
// classes.
const props = defineProps({
  node: { type: Object, required: true },
  builderFields: { type: Array, default: () => [] },
  searchOpen: { type: Boolean, default: false },
  filtersOpen: { type: Boolean, default: false }
});

const searchModel = defineModel('search', { type: String, default: '' });
const filterModel = defineModel('filter', { type: Object, default: null });
const spacing = inject('uiMappingSpacing', null);
const toolbarClasses = computed(() => (spacing ? spacing.toolbar : LAYOUT.row));
const editorSize = computed(() => (spacing ? spacing.editorSize : undefined));

</script>
