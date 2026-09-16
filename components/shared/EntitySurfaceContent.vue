<template>
  <div
    v-if="renderableFields.length || showPreview"
    :class="['entity-surface', detailSplit ? 'entity-surface--detail flex flex-col gap-4' : 'flex flex-col gap-3']"
  >
    <EntityPreview
      v-if="showPreview"
      :entity="entity"
      :entity-type="entityType"
      :mode="display.surfaceContract.preview"
    />
    <div :class="detailSplit ? 'entity-surface-facts flex min-w-0 flex-col gap-5' : 'flex min-w-0 flex-col gap-3'">
      <section
        v-for="section in detailSections"
        :key="section.name"
        class="flex min-w-0 flex-col gap-2"
      >
        <small v-if="detailSections.length > 1" class="uppercase text-muted text-supporting">
          {{ sectionLabel(section.name) }}
        </small>
        <DataBlock
          :entity-type="display.entityType"
          :entity="entity"
          :access-entity="accessEntity"
          :fields="section.fields"
          :variant="dataVariant"
        />
      </section>
      <DataBlock
        v-if="!sectioned && dataFields.length"
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
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityPreview from '~/components/shared/EntityPreview.vue';
import EntityRelationsBlock from '~/components/shared/EntityRelationsBlock.vue';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, default: '' },
  surface: { type: String, default: 'card' },
  accessEntity: { type: Object, default: null },
  suppressChildSummaries: { type: Boolean, default: false },
  relationVariant: { type: String, default: 'inline' },
  displayExtensions: { type: Object, default: null },
  displayOverrides: { type: Object, default: null }
});

const { t, te } = useI18n();

const display = computed(() => resolveEntityDisplayContract({
  entityType: props.entityType,
  surface: props.surface,
  extensions: props.displayExtensions,
  overrides: props.displayOverrides
}));

const renderableFields = computed(() => display.value.fields.filter(field => (
  field.role !== 'previewSource'
  && !(props.suppressChildSummaries && (field.role === 'childCount' || field.replacesCountPath))
)));
const dataFields = computed(() => renderableFields.value.filter(field =>
  field.display !== 'entityRef'
  && field.display !== 'entityRefList'
));
const relationFields = computed(() => renderableFields.value.filter(field =>
  field.display === 'entityRef' || field.display === 'entityRefList'
));
const showPreview = computed(() => display.value.surfaceContract.preview !== 'none');
// The detail surface composes a real page body, not a tall card: geometry or
// thumbnail media sits beside the fact column on wide containers and stacks
// above it on narrow ones. Sectioned data display chunks the fact column by
// field group with a small localized heading, so identity, specs, stock, and
// production facts read as separate concerns instead of one flat grid.
const sectioned = computed(() => props.surface === 'detail' && display.value.surfaceContract.dataDisplay === 'sectioned');
const detailSplit = computed(() => props.surface === 'detail' && showPreview.value);
const detailSections = computed(() => {
  if (!sectioned.value) return [];
  const byGroup = new Map();
  for (const field of dataFields.value) {
    const group = field.group || 'summary';
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(field);
  }
  return [...byGroup.entries()]
    .map(([name, fields]) => ({ name, fields }))
    .filter(section => section.fields.length);
});
function sectionLabel(name) {
  const key = `entityGroups.${name}`;
  return te?.(key) ? t(key) : name;
}
const dataVariant = computed(() =>
  display.value.surfaceContract.dataDisplay === 'compact' || display.value.surfaceContract.dataDisplay === 'inline'
    ? 'compact'
    : 'default'
);
</script>

<style scoped>
.entity-surface--detail {
  container-type: inline-size;
}

@container (min-width: 48rem) {
  .entity-surface--detail {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(15rem, 2fr);
    align-items: start;
  }
}
</style>
