<template>
  <div v-if="renderableFields.length || showPreview" class="flex flex-col gap-3">
    <EntityPreview
      v-if="showPreview"
      :entity="entity"
      :entity-type="entityType"
      :mode="display.surfaceContract.preview"
    />
    <DataBlock
      v-if="dataFields.length"
      :entity-type="display.entityType"
      :entity="entity"
      :access-entity="accessEntity"
      :fields="dataFields"
      :variant="dataVariant"
    />
    <EntityRelationsBlock
      v-if="relationFields.length"
      :entity="entity"
      :entity-type="entityType"
      :fields="relationFields"
      :item-variant="relationVariant"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityPreview from '~/components/shared/EntityPreview.vue';
import EntityRelationsBlock from '~/components/shared/EntityRelationsBlock.vue';
import { resolveDataPath } from '~/utils/data-display.js';
import { resolveEntityRelationRefs } from '~/utils/entity-relations.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true },
  surface: { type: String, default: 'card' },
  accessEntity: { type: Object, default: null },
  suppressChildCounts: { type: Boolean, default: false },
  relationVariant: { type: String, default: 'inline' },
  displayExtensions: { type: Object, default: null },
  displayOverrides: { type: Object, default: null }
});

const display = computed(() => resolveEntityDisplayContract({
  entityType: props.entityType,
  surface: props.surface,
  extensions: props.displayExtensions,
  overrides: props.displayOverrides
}));

const renderableFields = computed(() => display.value.fields.filter(field => field.role !== 'previewSource'));
const dataFields = computed(() => renderableFields.value.filter(field =>
  field.display !== 'entityRef'
  && field.display !== 'entityRefList'
  && !(props.suppressChildCounts && suppressedChildCountPaths.value.has(field.path))
));
const relationFields = computed(() => renderableFields.value.filter(field =>
  field.display === 'entityRef' || field.display === 'entityRefList'
));
const showPreview = computed(() => display.value.surfaceContract.preview !== 'none');
const dataVariant = computed(() =>
  display.value.surfaceContract.dataDisplay === 'compact' || display.value.surfaceContract.dataDisplay === 'inline'
    ? 'compact'
    : 'default'
);
const suppressedChildCountPaths = computed(() => {
  if (!props.suppressChildCounts) return new Set();
  return new Set(relationFields.value
    .filter(field => field.replacesCountPath)
    .filter(field => resolveEntityRelationRefs(resolveDataPath(props.entity, field.path), field).length)
    .map(field => field.replacesCountPath));
});
</script>
