<script setup>
import { computed, defineAsyncComponent, inject, onMounted, onUnmounted, provide, ref, unref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import EntityPreview from '~/components/shared/EntityPreview.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import { isGeneratedSurfaceAction, resolveGeneratedEntityActions } from '~/components/generated/action-visibility.js';
import { generatedDetailActionIds } from '~/components/generated/detail-screen-actions.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { openEntityChat } from '~/utils/entity-chat.js';
import { openEntityInWorkspace } from '~/utils/entity-workspace-open.js';
import { useInstancesStore } from '~/stores/instances';
import { normalizeHierarchyType } from '~/utils/entity-hierarchy.js';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';
import { hasMeaningfulWorkflowStatus } from '~/utils/status-actions.js';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

const CARD_COMPONENTS = {
  facade: defineAsyncComponent(() => import('~/components/entities/Facade/FacadeCard.vue')),
  facadePattern: defineAsyncComponent(() => import('~/components/entities/FacadePattern/FacadePatternCard.vue')),
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
  artifact: defineAsyncComponent(() => import('~/components/entities/Artifact/ArtifactCard.vue')),
  artifactTemplate: defineAsyncComponent(() => import('~/components/entities/ArtifactTemplate/ArtifactTemplateCard.vue'))
};

const props = defineProps({
  type: { type: String, required: true },
  id: { type: [String, Number, Object], default: null },
  entity: { type: Object, default: null },
  fetch: { type: Boolean, default: true },
  fields: { type: Array, default: () => ['serial'] },
  allowDetailRoute: { type: Boolean, default: true },
  interactive: { type: Boolean, default: true },
  variant: { type: String, default: 'inline' },
  contextActionEntries: { type: Array, default: () => [] }
});

const loaded = ref(null);
const compactOp = ref();
const authStore = useAuthStore();
const instances = useInstancesStore();
const { t } = useI18n();
const entityContext = inject('entityContext', null);
const generatedExecuteAction = inject('generatedExecuteAction', null);
const normalizedId = computed(() => props.id?.toString?.() || props.id || '');
const contract = computed(() =>
  DESIGN_SYSTEM_ENTITY_CONTRACTS.find(entry => entry.key === props.type || entry.typeId === props.type) || null
);
const generatedTypeId = computed(() => contract.value?.typeId || generatedTypeIdFor(props.type));
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
const hydrated = ref(null);
const relationSheetDesigns = ref([]);
const relationFetchId = computed(() => normalizedId.value
  || entityId(props.entity)
  || entityId(contextEntity.value)
  || ''
);
const baseResolved = computed(() => hydrated.value || props.entity || contextEntity.value || loaded.value);
const resolved = computed(() => withNestingRunOutputRefs(baseResolved.value));
const resolvedId = computed(() => normalizedId.value
  || resolved.value?._id?.toString?.()
  || resolved.value?.id?.toString?.()
  || resolved.value?.identity?.uid
  || ''
);
const icon = computed(() => instances.iconFor(props.type));
const cardComponent = computed(() => CARD_COMPONENTS[contract.value?.key] || null);
// `interactive: false` renders the inline entity card non-expandable, so
// non-interactive rows (explorer entries, static summaries) can consume the
// inline card without its detail popup.
const cardProps = computed(() => ({
  [contract.value?.propName || 'entity']: resolved.value,
  variant: 'inline',
  expandable: props.interactive
}));
const detailRoute = computed(() => {
  if (!props.allowDetailRoute || !authStore.processActive || !resolvedId.value) return null;
  return detailRouteForEntity({
    entity: resolved.value || { _id: resolvedId.value },
    typeId: generatedTypeId.value,
    manifest: authStore.screenManifest
  });
});
provide('entityInlineDetailRoute', detailRoute);
provide('entityInlineForceTrace', true);
provide('entityInlineTypeLabel', computed(() => contract.value?.labelKey ? t(contract.value.labelKey) : props.type));
provide('entityInlineActionIds', computed(() => popupActionIds.value));
provide('entityInlineActionEntity', resolved);
provide('entityInlineActionTypeId', generatedTypeId);
provide('entityInlineShowCassetteDesigner', computed(() => popupShowCassetteDesigner.value));
provide('entityInlineExecuteAction', executePopupAction);
const toneStyle = computed(() => entityToneStyle(props.type));
const compactDisplay = computed(() => resolveEntityDisplayContract({
  typeId: generatedTypeId.value,
  surface: 'compact'
}));
const compactDataFields = computed(() => compactDisplay.value.fields.filter(field =>
  field.display !== 'entityRef'
  && field.display !== 'entityRefList'
  && field.role !== 'previewSource'
));
const compactHasPreview = computed(() => compactDisplay.value.surfaceContract.preview !== 'none');
const compactTypeLabel = computed(() => contract.value?.labelKey ? t(contract.value.labelKey) : props.type);
const compactPreviewHideDimensionLayer = computed(() =>
  ['cassette', 'cassette_design', 'sheet_design'].includes(generatedTypeId.value)
);
const compactStatusState = computed(() => {
  if (!hasMeaningfulWorkflowStatus(generatedTypeId.value, authStore.statusWorkflows || undefined)) return '';
  const state = resolved.value?.status?.state;
  if (typeof state === 'string') return state;
  return state?.primary || state?.active?.main || '';
});
const compactStatusDisplay = computed(() => resolved.value?.status?.metadata?.display || null);
const popupDetailActionIds = computed(() => generatedDetailActionIds({
  screens: authStore.screenManifest,
  typeId: generatedTypeId.value,
  preferredRoute: typeof detailRoute.value === 'string' ? detailRoute.value : detailRoute.value?.path
}));
const hasGeneratedActionExecutor = computed(() => typeof unref(generatedExecuteAction) === 'function');
const popupActions = computed(() => {
  if (!hasGeneratedActionExecutor.value) return [];
  const standard = resolveGeneratedEntityActions({
    actionIds: popupDetailActionIds.value,
    actionManifest: authStore.actionManifest,
    entity: resolved.value,
    typeId: generatedTypeId.value
  })
    .filter(isGeneratedSurfaceAction)
    .filter(action => !isConsumedDetailAction(action));
  const contextual = props.contextActionEntries
    .map(entry => authStore.actionManifest.find(action => action.id === entry.id))
    .filter(Boolean);
  return Array.from(new Map([...standard, ...contextual]
    .map(action => [action.id, action])).values());
});
const popupActionIds = computed(() => popupActions.value.map(action => action.id));
const popupShowCassetteDesigner = computed(() => generatedTypeId.value === 'cassette');
const popupHasActions = computed(() => (
  popupShowCassetteDesigner.value
  || popupActionIds.value.length
));

watch(
  () => [props.entity, relationFetchId.value, props.type, entityId(contextEntity.value)],
  async () => {
    loaded.value = null;
    hydrated.value = null;
    relationSheetDesigns.value = [];
    if (!relationFetchId.value || !props.fetch) return;

    const provided = props.entity || contextEntity.value;
    if (!provided) {
      loaded.value = await instances.resolveReadableReference(instances.canonicalTypeKey(props.type), relationFetchId.value, { silent: true });
      await hydrateNestingRunOutputs(loaded.value);
      return;
    }

    if (needsNestingRunHydration(provided)) {
      hydrated.value = await instances.resolveReadableReference(instances.canonicalTypeKey(props.type), relationFetchId.value, { silent: true });
    }
    await hydrateNestingRunOutputs(hydrated.value || provided);
  },
  { immediate: true }
);

function entityId(entity) {
  return entity?._id?.toString?.()
    || entity?.id?.toString?.()
    || entity?.identity?.uid
    || '';
}

function hasNestingRunOutputRefs(entity) {
  return Array.isArray(entity?.data?.sheetDesignIds) && entity.data.sheetDesignIds.length > 0;
}

function needsNestingRunHydration(entity) {
  return generatedTypeId.value === 'nesting_run' && !hasNestingRunOutputRefs(entity);
}

async function hydrateNestingRunOutputs(entity) {
  if (generatedTypeId.value !== 'nesting_run' || !entity) return;
  const runId = entityId(entity) || relationFetchId.value;
  if (!runId) return;
  relationSheetDesigns.value = await instances
    .listInstances(instances.canonicalTypeKey('sheetDesign'), { runId }, { silent: true })
    .catch(() => []);
}

function withNestingRunOutputRefs(entity) {
  if (generatedTypeId.value !== 'nesting_run' || !entity || !relationSheetDesigns.value.length) return entity;
  return {
    ...entity,
    data: {
      ...(entity.data || {}),
      sheetDesignIds: relationSheetDesigns.value
    }
  };
}

function contextTypeCandidates(type) {
  return Array.from(new Set([type, normalizeHierarchyType(type)].filter(Boolean)));
}

function generatedTypeIdFor(type) {
  return normalizeHierarchyType(type);
}

function isConsumedDetailAction(action = {}) {
  return generatedTypeId.value === 'queue'
    && action.actionKind === 'runCommand'
    && action.commandId === 'solveNesting';
}

function toggleCompactPopup(event) {
  if (!props.interactive) return;
  if (isInteractiveEventTarget(event)) return;
  compactOp.value?.toggle(event);
}

function onCompactKeydown(event) {
  if (isInteractiveEventTarget(event)) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleCompactPopup(event);
}

function openDetail(event) {
  event?.stopPropagation?.();
  requestCloseMobileTransientSurfaces();
  if (!detailRoute.value) return;
  if (typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches) {
    navigateTo(detailRoute.value);
    return;
  }
  if (openEntityInWorkspace({
    typeId: generatedTypeId.value || props.type,
    entityId: resolvedId.value
  })) return;
  navigateTo(detailRoute.value);
}

function openEntityChatFromRef(event) {
  event?.stopPropagation?.();
  requestCloseMobileTransientSurfaces();
  compactOp.value?.hide?.();
  openEntityChat({
    type: generatedTypeId.value || props.type,
    id: resolvedId.value,
    name: resolved.value?.identity?.name || ''
  });
}

function executePopupAction(action) {
  const executor = unref(generatedExecuteAction);
  if (typeof executor !== 'function' || !resolved.value) return;
  const contextual = props.contextActionEntries.find(entry => entry.id === action.id);
  executor(action, contextual?.entity || resolved.value, contextual?.context || {});
}

function closeCompactPopup() {
  compactOp.value?.hide?.();
}

onMounted(() => {
  if (!props.interactive) return;
  window.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeCompactPopup);
});

onUnmounted(() => {
  if (!props.interactive) return;
  window.removeEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeCompactPopup);
});

function entityToneStyle(type) {
  const family = entityFamilyAccent(type);
  const role = entitySemanticRole(type);
  return toneVars(family, role);
}

function entityFamilyAccent(type) {
  if (['project', 'queue'].includes(type)) return 'var(--ck-entity-tone-command)';
  if (['cassette', 'cassetteTemplate', 'cassetteDesign', 'cassetteInstance', 'profileTemplate'].includes(type)) return 'var(--ck-entity-tone-fabrication)';
  if (['sheet', 'sheetDesign', 'remnant', 'nestingRun'].includes(type)) return 'var(--ck-entity-tone-output)';
  if (['material', 'materialPile', 'batchPile', 'warehouse', 'catalog', 'color'].includes(type)) return 'var(--ck-entity-tone-material)';
  if (['organization', 'library', 'requisition', 'artifact', 'entityRevision', 'toolProfile', 'penTemplate', 'layerStandard', 'user'].includes(type)) return 'var(--ck-entity-tone-system)';
  return 'var(--p-surface-500)';
}

function entitySemanticRole(type) {
  if (['project', 'queue', 'library', 'catalog', 'warehouse', 'organization'].includes(type)) return 'container';
  if (['cassetteTemplate', 'cassetteDesign', 'sheetDesign', 'profileTemplate', 'entityRevision'].includes(type)) return 'definition';
  if (['artifact', 'toolProfile', 'penTemplate', 'layerStandard', 'user', 'requisition'].includes(type)) return 'meta';
  return 'item';
}

function toneVars(accent, role) {
  const palette = tonePalette(role);
  return {
    '--ck-inline-ref-accent': accent,
    '--ck-inline-ref-bg': `color-mix(in srgb, ${accent}, var(--p-content-background) ${palette.bgMix}%)`,
    '--ck-inline-ref-border': `color-mix(in srgb, ${accent}, var(--p-content-border-color) ${palette.borderMix}%)`,
    '--ck-inline-ref-fg': `color-mix(in srgb, ${accent}, var(--p-text-color) ${palette.fgMix}%)`,
    '--ck-inline-ref-shadow': palette.shadow,
    '--ck-inline-ref-font-weight': palette.weight
  };
}

function tonePalette(role) {
  if (role === 'container') {
    return {
      bgMix: 68,
      borderMix: 26,
      fgMix: 18,
      shadow: 'inset 0 0 0 999px color-mix(in srgb, var(--ck-inline-ref-accent), transparent 92%)',
      weight: 600
    };
  }
  if (role === 'definition') {
    return {
      bgMix: 84,
      borderMix: 42,
      fgMix: 26,
      shadow: 'inset 0 0 0 999px color-mix(in srgb, var(--ck-inline-ref-accent), transparent 96%)',
      weight: 550
    };
  }
  if (role === 'meta') {
    return {
      bgMix: 92,
      borderMix: 54,
      fgMix: 34,
      shadow: 'none',
      weight: 500
    };
  }
  return {
    bgMix: 96,
    borderMix: 46,
    fgMix: 30,
    shadow: 'none',
    weight: 500
  };
}
</script>

<template>
  <span
    v-if="variant === 'compact'"
    class="inline-flex w-full min-w-0 max-w-full"
    :style="toneStyle"
  >
    <span
      class="entity-inline-compact min-w-0 max-w-full"
      :class="{ 'cursor-pointer': Boolean(resolved) && interactive }"
      :role="resolved && interactive ? 'button' : undefined"
      :tabindex="resolved && interactive ? 0 : undefined"
      :data-entity-card-interactive="interactive ? 'true' : undefined"
      @click="resolved && interactive ? toggleCompactPopup($event) : undefined"
      @keydown="resolved && interactive ? onCompactKeydown($event) : undefined"
    >
      <span
        v-if="resolved && compactHasPreview"
        class="entity-inline-compact-preview"
        data-entity-card-interactive="true"
      >
        <EntityPreview
          :entity="resolved"
          :type-id="generatedTypeId"
          :mode="compactDisplay.surfaceContract.preview"
          :hide-dimension-layer="compactPreviewHideDimensionLayer"
        />
      </span>
      <span class="entity-inline-compact-main">
        <span class="entity-inline-compact-header">
          <IdentityBlock
            v-if="resolved"
            class="min-w-0 flex-1"
            :entity="resolved"
            variant="inline"
            :icon="icon"
            :fields="fields"
          />
          <span v-else class="min-w-0 flex-1 truncate text-label">
            {{ compactTypeLabel || $t('common.notAvailable') }}
          </span>
        </span>
        <span class="entity-inline-compact-status-row">
          <StatusBadge
            v-if="compactStatusState"
            :state="compactStatusState"
            :display="compactStatusDisplay"
            class="max-w-full"
          />
        </span>
        <span class="entity-inline-compact-facts">
          <DataBlock
            v-if="resolved && compactDataFields.length"
            :type-id="generatedTypeId"
            :entity="resolved"
            :fields="compactDataFields"
            variant="compact"
          />
        </span>
      </span>
    </span>

    <Popover v-if="interactive" ref="compactOp">
      <div class="w-[min(34rem,calc(100vw-3rem))]">
        <div class="flex flex-col gap-4 p-4">
          <TraceChain v-if="resolved" :entity="resolved" :type-id="type" />
          <small class="uppercase text-muted text-supporting">
            {{ compactTypeLabel }}
          </small>
          <div v-if="resolved" class="flex flex-wrap items-start justify-between gap-3">
            <IdentityBlock :entity="resolved" />
            <EntityStatus
              v-if="resolved.status"
              :entity="resolved"
              :type-id="generatedTypeId"
              variant="inline"
            />
          </div>
          <div class="entity-card-popup-content">
            <EntitySurfaceContent
              v-if="resolved"
              :entity="resolved"
              :type-id="generatedTypeId"
              surface="card"
              suppress-child-summaries
              relation-variant="compact"
              :display-overrides="{ dataDisplay: 'compact' }"
            />
          </div>
          <div v-if="popupHasActions || detailRoute || resolvedId" class="flex flex-wrap justify-end gap-2" @click.stop>
            <Button
              v-if="resolvedId && !cardComponent"
              icon="pi pi-comments"
              text
              rounded
              size="small"
              :aria-label="$t('support.entityChat')"
              @click="openEntityChatFromRef"
            />
            <GeneratedCassetteDesignerAction
              v-if="popupShowCassetteDesigner"
              :entity="resolved"
            />
            <GeneratedActionButton
              v-for="actionId in popupActionIds"
              :key="actionId"
              :action-id="actionId"
              @execute="executePopupAction"
            />
            <Button
              v-if="detailRoute"
              icon="pi pi-external-link"
              text
              rounded
              size="small"
              :aria-label="$t('common.open')"
              @click="openDetail"
            />
          </div>
        </div>
      </div>
    </Popover>
  </span>

  <span v-else class="entity-inline-tone inline-flex min-w-0 max-w-full items-center align-middle" :class="{ 'pointer-events-none': !interactive }" :style="toneStyle">
    <component
      v-if="resolved && cardComponent"
      :is="cardComponent"
      v-bind="cardProps"
      class="min-w-0 max-w-full"
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
    <span v-else class="inline-flex min-w-0 items-center gap-1.5 text-muted" data-entity-card-interactive="true">
      <i :class="icon" class="shrink-0"></i>
      <span class="truncate">{{ resolvedId || $t('common.notAvailable') }}</span>
    </span>
  </span>
</template>
