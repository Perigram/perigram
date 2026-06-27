<script setup>
import { computed, defineAsyncComponent, inject, provide, ref, unref, watch } from 'vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi';
import { useEntity } from '~/composables/useEntity';
import { useAuthStore } from '~/stores/auth';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';

const CARD_COMPONENTS = {
  project: defineAsyncComponent(() => import('~/components/entities/Project/ProjectCard.vue')),
  queue: defineAsyncComponent(() => import('~/components/entities/Queue/QueueCard.vue')),
  nestingRun: defineAsyncComponent(() => import('~/components/entities/NestingRun/NestingRunCard.vue')),
  sheetDesign: defineAsyncComponent(() => import('~/components/entities/SheetDesign/SheetDesignCard.vue')),
  cassette: defineAsyncComponent(() => import('~/components/entities/Cassette/CassetteCard.vue')),
  cassetteDesign: defineAsyncComponent(() => import('~/components/entities/CassetteDesign/CassetteDesignCard.vue')),
  cassetteTemplate: defineAsyncComponent(() => import('~/components/entities/CassetteTemplate/CassetteTemplateCard.vue')),
  cassetteInstance: defineAsyncComponent(() => import('~/components/entities/CassetteInstance/CassetteInstanceCard.vue')),
  requisition: defineAsyncComponent(() => import('~/components/entities/Requisition/RequisitionCard.vue')),
  material: defineAsyncComponent(() => import('~/components/entities/Material/MaterialCard.vue')),
  materialPile: defineAsyncComponent(() => import('~/components/entities/MaterialPile/PileCard.vue')),
  batchPile: defineAsyncComponent(() => import('~/components/entities/BatchPile/BatchPileCard.vue')),
  sheet: defineAsyncComponent(() => import('~/components/entities/Sheet/SheetCard.vue')),
  remnant: defineAsyncComponent(() => import('~/components/entities/Remnant/RemnantCard.vue')),
  library: defineAsyncComponent(() => import('~/components/entities/Library/LibraryCard.vue')),
  catalog: defineAsyncComponent(() => import('~/components/entities/Catalog/CatalogCard.vue')),
  color: defineAsyncComponent(() => import('~/components/entities/Color/ColorCard.vue')),
  entityRevision: defineAsyncComponent(() => import('~/components/entities/EntityRevision/EntityRevisionCard.vue')),
  warehouse: defineAsyncComponent(() => import('~/components/entities/Warehouse/WarehouseCard.vue')),
  toolProfile: defineAsyncComponent(() => import('~/components/entities/ToolProfile/ToolProfileCard.vue')),
  penTemplate: defineAsyncComponent(() => import('~/components/entities/PenTemplate/PenTemplateCard.vue')),
  layerStandard: defineAsyncComponent(() => import('~/components/entities/LayerStandard/LayerStandardCard.vue')),
  user: defineAsyncComponent(() => import('~/components/entities/User/UserCard.vue')),
  organization: defineAsyncComponent(() => import('~/components/entities/Organization/OrganizationCard.vue')),
  artifact: defineAsyncComponent(() => import('~/components/entities/Artifact/ArtifactCard.vue'))
};

const props = defineProps({
  type: { type: String, required: true },
  id: { type: [String, Number, Object], default: null },
  entity: { type: Object, default: null },
  fetch: { type: Boolean, default: true },
  fields: { type: Array, default: () => ['serial'] },
  allowDetailRoute: { type: Boolean, default: true }
});

const loaded = ref(null);
const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const entityApi = useEntity(props.type);
const entityContext = inject('entityContext', null);
const normalizedId = computed(() => props.id?.toString?.() || props.id || '');
const contextEntity = computed(() => {
  if (!normalizedId.value) return null;
  const context = unref(entityContext);
  const entities = context?.entities || {};
  for (const type of contextTypeCandidates(props.type)) {
    const entity = entities[type]?.[normalizedId.value];
    if (entity) return entity;
  }
  return null;
});
const resolved = computed(() => props.entity || contextEntity.value || loaded.value);
const icon = computed(() => domainUi.getIcon?.(props.type) || 'pi pi-box');
const contract = computed(() =>
  DESIGN_SYSTEM_ENTITY_CONTRACTS.find(entry => entry.key === props.type || entry.entityType === props.type) || null
);
const cardComponent = computed(() => CARD_COMPONENTS[contract.value?.key] || null);
const cardProps = computed(() => ({
  [contract.value?.propName || 'entity']: resolved.value,
  variant: 'inline'
}));
const detailRoute = computed(() => {
  if (!props.allowDetailRoute || !authStore.processActive || !normalizedId.value) return null;
  return detailRouteForEntity({
    entity: resolved.value || { _id: normalizedId.value },
    entityType: generatedEntityType.value,
    manifest: authStore.screenManifest
  });
});
provide('entityInlineDetailRoute', detailRoute);

watch(
  () => [props.entity, normalizedId.value, props.type, contextEntity.value?._id],
  async () => {
    loaded.value = null;
    if (props.entity || contextEntity.value || !normalizedId.value || !props.fetch) return;
    loaded.value = await entityApi.fetch(normalizedId.value, { silent: true }).catch(() => null);
  },
  { immediate: true }
);

function contextTypeCandidates(type) {
  const aliases = {
    nestingRun: 'nesting_run',
    sheetDesign: 'sheet_design',
    cassetteDesign: 'cassette_design',
    cassetteTemplate: 'cassette',
    cassetteInstance: 'cassette_instance',
    materialPile: 'material_pile',
    batchPile: 'material_pile',
    entityRevision: 'entity_revision',
    geometryCapture: 'geometry_capture',
    toolProfile: 'tool_profile',
    penTemplate: 'pen_template',
    layerStandard: 'layer_standard'
  };
  return Array.from(new Set([type, aliases[type]].filter(Boolean)));
}

const generatedEntityType = computed(() => contract.value?.entityType || generatedEntityTypeFor(props.type));

function generatedEntityTypeFor(type) {
  const aliases = {
    nestingRun: 'nesting_run',
    sheetDesign: 'sheet_design',
    cassetteDesign: 'cassette_design',
    cassetteTemplate: 'cassette',
    cassetteInstance: 'cassette_instance',
    materialPile: 'material_pile',
    batchPile: 'material_pile',
    entityRevision: 'entity_revision',
    geometryCapture: 'geometry_capture',
    toolProfile: 'tool_profile',
    penTemplate: 'pen_template',
    layerStandard: 'layer_standard'
  };
  return aliases[type] || type;
}
</script>

<template>
  <component
    v-if="resolved && cardComponent"
    :is="cardComponent"
    v-bind="cardProps"
    data-entity-card-interactive="true"
  />
  <IdentityBlock
    v-else-if="resolved"
    :entity="resolved"
    variant="inline"
    :icon="icon"
    :fields="fields"
    data-entity-card-interactive="true"
  />
  <span v-else class="inline-flex min-w-0 items-center gap-1.5 text-muted-color" data-entity-card-interactive="true">
    <i :class="icon" class="shrink-0"></i>
    <span class="truncate">{{ normalizedId || $t('common.notAvailable') }}</span>
  </span>
</template>
