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
      :fields="relationFields"
    />
  </div>
</template>

<script setup>
import { computed, inject, unref } from 'vue';
import { cncSummaries } from '@cutkit/domain-cnc';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityPreview from '~/components/shared/EntityPreview.vue';
import EntityRelationsBlock from '~/components/shared/EntityRelationsBlock.vue';
import { entityKeyForDisplay, resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true },
  surface: { type: String, default: 'card' },
  accessEntity: { type: Object, default: null },
  suppressChildCounts: { type: Boolean, default: false },
  displayExtensions: { type: Object, default: null },
  displayOverrides: { type: Object, default: null }
});

const entityContext = inject('entityContext', null);

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
  && !(props.suppressChildCounts && field.role === 'childCount' && derivedChildRelationPaths.value.has(field.path))
));
const relationFields = computed(() => [
  ...renderableFields.value.filter(field => field.display === 'entityRef' || field.display === 'entityRefList'),
  ...derivedChildRelationFields.value
]);
const showPreview = computed(() => display.value.surfaceContract.preview !== 'none');
const dataVariant = computed(() =>
  display.value.surfaceContract.dataDisplay === 'compact' || display.value.surfaceContract.dataDisplay === 'inline'
    ? 'compact'
    : 'default'
);

const derivedChildRelationFields = computed(() => {
  if (!props.suppressChildCounts) return [];

  const context = unref(entityContext);
  const lists = context?.lists || {};
  const entityId = props.entity?._id?.toString?.() || props.entity?.id?.toString?.() || '';
  if (!entityId) return [];

  return renderableFields.value
    .filter(field => field.role === 'childCount')
    .map(field => {
      const summary = cncSummaries.find(entry =>
        entityKeyForDisplay(entry.parentType) === display.value.key
        && `summary.${entry.countField}` === field.path
      );
      if (!summary) return null;

      const childType = entityKeyForDisplay(summary.entityType);
      const candidates = lists[childType] || lists[summary.entityType] || [];
      const items = candidates.filter(item => item?.lineage?.[summary.parentIdKey]?.toString?.() === entityId);
      if (!items.length) return null;

      return {
        path: field.path,
        i18n: field.i18n,
        display: 'entityRefList',
        entityType: childType,
        items: items.map(item => ({
          entityType: childType,
          id: item?._id?.toString?.() || item?.id?.toString?.() || item?.identity?.uid,
          entity: item
        })).filter(item => item.id)
      };
    })
    .filter(Boolean);
});
const derivedChildRelationPaths = computed(() => new Set(derivedChildRelationFields.value.map(field => field.path)));
</script>
