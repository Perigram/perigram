<template>
  <div
    v-if="factRows.length || relationFields.length || showPreview"
    :class="['entity-surface', detailSplit ? 'entity-surface--detail flex flex-col gap-4' : 'flex flex-col gap-3']"
  >
    <InstancePreview
      v-if="showPreview"
      :entity="entity"
      :type-id="typeId"
      :mode="display.surfaceContract.preview"
    />
    <div :class="detailSplit ? 'entity-surface-facts flex min-w-0 flex-col gap-5' : 'flex min-w-0 flex-col gap-3'">
      <section
        v-for="section in detailSections"
        :key="section.name"
        class="flex min-w-0 flex-col gap-2"
      >
        <small v-if="detailSections.length > 1" class="text-muted text-supporting">
          {{ sectionLabel(section.name) }}
        </small>
        <FactRows :rows="section.rows" :variant="dataVariant" />
      </section>
      <FactRows
        v-if="!sectioned && factRows.length"
        :rows="factRows"
        :variant="dataVariant"
      />
      <InstanceRelationsBlock
        v-if="relationFields.length"
        :entity="entity"
        :type-id="typeId"
        :fields="relationFields"
        :item-variant="relationVariant"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import FactRows from '~/components/shared/FactRows.vue';
import InstancePreview from '~/components/shared/InstancePreview.vue';
import InstanceRelationsBlock from '~/components/shared/InstanceRelationsBlock.vue';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { instanceFactRows } from '~/utils/fact-rows.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useRegistryStore } from '~/stores/registry';
import { useAuthStore } from '~/stores/auth';
import { resolveFieldGroups, isIdentifierField } from '#shared/ui-mapping/index.js';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, default: '' },
  surface: { type: String, default: 'card' },
  accessEntity: { type: Object, default: null },
  relationVariant: { type: String, default: 'inline' },
  displayOverrides: { type: Object, default: null }
});

const { t, te, locale } = useI18n();
// Fact rows resolve from the served org type view (the compiled CTS
// client bundle cached by useFileTypeView); the registry store touch
// keeps the declaration-derived display-access registration alive
// wherever fact rows render.
const { typeById } = useFileTypeView();
useRegistryStore();
const authStore = useAuthStore();

const display = computed(() => resolveInstanceDisplayContract({
  typeId: props.typeId,
  surface: props.surface,
  typeRecord: typeById(props.typeId),
  overrides: props.displayOverrides
}));

const typeRecord = computed(() => typeById(props.typeId));
const factGateAuth = () => ({
  permissions: authStore.activePermissions,
  fieldPolicies: authStore.fieldPolicies,
  stateFieldPolicies: authStore.stateFieldPolicies
});
// The generated field derivation serves every read-only surface here:
// scalar rows through FactRows, declared ref fields through the
// relations block.
const factRows = computed(() => instanceFactRows({
  typeId: props.typeId,
  typeRecord: typeRecord.value,
  entity: props.entity,
  accessEntity: props.accessEntity,
  auth: factGateAuth(),
  translator: { t, te, locale }
}));
const relationFields = computed(() => {
  if (!typeRecord.value) return [];
  return resolveFieldGroups(typeRecord.value)
    .flatMap(group => group.fields)
    .filter(field => field.descriptor?.base === 'ref' && !isIdentifierField(typeRecord.value, field.name))
    .map(field => ({ path: `fields.${field.name}`, label: field.label || field.name, display: 'entityRef' }));
});
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
  for (const row of factRows.value) {
    const group = row.group || 'summary';
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(row);
  }
  return [...byGroup.entries()]
    .map(([name, rows]) => ({ name, rows }))
    .filter(section => section.rows.length);
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
