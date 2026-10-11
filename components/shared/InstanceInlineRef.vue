<script setup>
import { computed, defineAsyncComponent, inject, onMounted, onUnmounted, provide, ref, unref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import InstancePreview from '~/components/shared/InstancePreview.vue';
import InstanceState from '~/components/shared/state/InstanceState.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedEditorPageAction from '~/components/generated/GeneratedEditorPageAction.vue';
import { isGeneratedSurfaceAction, resolveGeneratedEntityActions } from '~/components/generated/action-visibility.js';
import { generatedDetailActionIds } from '~/components/generated/detail-screen-actions.js';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useInstancesStore } from '~/stores/instances';
import { normalizeHierarchyType } from '~/utils/instance-hierarchy.js';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { instanceHasEditorAction } from '~/components/generated/instance-editor-action.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

const CARD_COMPONENTS = {
  entityRevision: defineAsyncComponent(() => import('~/components/entities/EntityRevision/EntityRevisionCard.vue')),
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
const relationFetchId = computed(() => normalizedId.value
  || instanceId(props.entity)
  || instanceId(contextEntity.value)
  || ''
);
const baseResolved = computed(() => hydrated.value || props.entity || contextEntity.value || loaded.value);
const resolved = computed(() => baseResolved.value);
const resolvedId = computed(() => normalizedId.value
  || resolved.value?._id?.toString?.()
  || resolved.value?.id?.toString?.()
  || resolved.value?._id
  || ''
);
const icon = computed(() => instances.iconFor(props.type));
const cardComponent = computed(() => CARD_COMPONENTS[contract.value?.key] || null);
// Directory types (user, organization) have no generated detail screen and
// no standalone route: their open action goes through the workspace-open
// seam — a home pane tab on desktop, the home dialog on mobile.
const directoryOpen = computed(() => ['user', 'organization'].includes(contract.value?.key)
  && Boolean(resolvedId.value));
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
  return detailRouteForInstance({
    entity: resolved.value || { _id: resolvedId.value },
    typeId: generatedTypeId.value,
    manifest: authStore.screenManifest
  });
});
provide('instanceInlineDetailRoute', detailRoute);
provide('instanceInlineOpenDetail', openDetail);
provide('instanceInlineForceTrace', true);
provide('instanceInlineTypeLabel', computed(() => contract.value?.labelKey ? t(contract.value.labelKey) : props.type));
provide('instanceInlineActionIds', computed(() => popupActionIds.value));
provide('instanceInlineActionEntity', resolved);
provide('instanceInlineActionTypeId', generatedTypeId);
provide('instanceInlineHasEditorAction', computed(() => popupHasEditorAction.value));
provide('instanceInlineExecuteAction', executePopupAction);
const toneStyle = computed(() => entityToneStyle(props.type));
const { typeById } = useFileTypeView();
const compactDisplay = computed(() => resolveInstanceDisplayContract({
  typeId: generatedTypeId.value,
  surface: 'compact',
  typeRecord: typeById(generatedTypeId.value)
}));
// Record titles resolve through the one title resolver (identifier field
// value via the wire-to-screen bridge; unnamed otherwise). The legacy
// meta-facts channel (slug/serial beside the label) died with the
// identity-chrome helpers.
const typeView = computed(() => typeById(generatedTypeId.value));
const identityLabel = computed(() => titleFor(
  typeView.value ? dtoToScreenInstance(resolved.value, typeView.value) : null,
  typeView.value,
  { unnamedLabel: t('common.unnamed') }
));
const compactDataFields = computed(() => compactDisplay.value.fields.filter(field =>
  field.display !== 'entityRef'
  && field.display !== 'entityRefList'
  && field.role !== 'previewSource'
));
const compactHasPreview = computed(() => compactDisplay.value.surfaceContract.preview !== 'none');
// The micro card earns its box: it renders only when the type's compact
// surface carries something to show beside identity — a preview band or
// compact fact rows. Preview-less, fact-less relations render as the
// plain identity chip (still the popover trigger), so galleries never
// lay out grids of empty cards for data without visual fields.
const compactCardWorthy = computed(() => compactHasPreview.value || compactDataFields.value.length > 0);
const compactTypeLabel = computed(() => contract.value?.labelKey ? t(contract.value.labelKey) : props.type);
// The compact chip's status resolves through the flat contract: the
// instance's wire `state` value against the type's policy map.
const { policyFor } = useStatePolicy();
const compactPolicy = policyFor(() => generatedTypeId.value);
const compactStatusState = computed(() => {
  const value = resolved.value?.state;
  return typeof value === 'string' && value ? value : '';
});
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
    .filter(isGeneratedSurfaceAction);
  const contextual = props.contextActionEntries
    .map(entry => authStore.actionManifest.find(action => action.id === entry.id))
    .filter(Boolean);
  return Array.from(new Map([...standard, ...contextual]
    .map(action => [action.id, action])).values());
});
const popupActionIds = computed(() => popupActions.value.map(action => action.id));
const popupHasEditorAction = computed(() => instanceHasEditorAction(generatedTypeId.value));
const popupHasActions = computed(() => (
  popupHasEditorAction.value
  || popupActionIds.value.length
));

watch(
  () => [props.entity, relationFetchId.value, props.type, instanceId(contextEntity.value)],
  async () => {
    loaded.value = null;
    hydrated.value = null;
    if (!relationFetchId.value || !props.fetch) return;

    const provided = props.entity || contextEntity.value;
    if (!provided) {
      loaded.value = await instances.resolveReadableReference(instances.canonicalTypeKey(props.type), relationFetchId.value, { silent: true });
    }
  },
  { immediate: true }
);

function instanceId(entity) {
  return entity?._id?.toString?.()
    || entity?.id?.toString?.()
    || entity?._id
    || '';
}


function contextTypeCandidates(type) {
  return Array.from(new Set([type, normalizeHierarchyType(type)].filter(Boolean)));
}

function generatedTypeIdFor(type) {
  return normalizeHierarchyType(type);
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
  if (detailRoute.value) {
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(max-width: 767px)')?.matches) {
      navigateTo(detailRoute.value);
      return;
    }
    if (openInstanceInWorkspace({
      typeId: generatedTypeId.value || props.type,
      instanceId: resolvedId.value
    })) return;
    navigateTo(detailRoute.value);
    return;
  }
  if (directoryOpen.value) {
    openInstanceInWorkspace({
      typeId: generatedTypeId.value || props.type,
      instanceId: resolvedId.value
    });
  }
}

function openEntityChatFromRef(event) {
  event?.stopPropagation?.();
  requestCloseMobileTransientSurfaces();
  compactOp.value?.hide?.();
  openInstanceChat({
    type: generatedTypeId.value || props.type,
    id: resolvedId.value,
    name: resolved.value?.name || ''
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

  if (['cassette', 'profileTemplate'].includes(type)) return 'var(--ck-entity-tone-fabrication)';
  if (['sheetDesign'].includes(type)) return 'var(--ck-entity-tone-output)';
  if (['color'].includes(type)) return 'var(--ck-entity-tone-material)';
  if (['organization', 'artifact', 'entityRevision', 'user'].includes(type)) return 'var(--ck-entity-tone-system)';
  return 'var(--p-surface-500)';
}

function entitySemanticRole(type) {
  if (['organization'].includes(type)) return 'container';
  if (['sheetDesign', 'profileTemplate', 'entityRevision'].includes(type)) return 'definition';
  if (['artifact', 'user'].includes(type)) return 'meta';
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
    v-if="variant === 'compact' && compactCardWorthy"
    class="inline-flex w-full min-w-0 max-w-full"
    :style="toneStyle"
  >
    <span
      class="instance-inline-compact min-w-0 max-w-full"
      :class="{ 'cursor-pointer': Boolean(resolved) && interactive }"
      :role="resolved && interactive ? 'button' : undefined"
      :tabindex="resolved && interactive ? 0 : undefined"
      :data-instance-card-interactive="interactive ? 'true' : undefined"
      @click="resolved && interactive ? toggleCompactPopup($event) : undefined"
      @keydown="resolved && interactive ? onCompactKeydown($event) : undefined"
    >
      <span
        v-if="resolved && compactHasPreview"
        class="instance-inline-compact-preview"
        data-instance-card-interactive="true"
      >
        <InstancePreview
          :entity="resolved"
          :type-id="generatedTypeId"
          :mode="compactDisplay.surfaceContract.preview"
          hide-dimension-layer
        />
      </span>
      <span class="instance-inline-compact-main">
        <span class="instance-inline-compact-header">
          <span
            v-if="resolved"
            class="instance-inline-chip min-w-0 max-w-full flex-1"
            :title="identityLabel"
          >
            <i v-if="icon" :class="['instance-inline-chip-icon', icon]" aria-hidden="true"></i>
            <span class="instance-inline-chip-label">{{ identityLabel }}</span>
          </span>
          <span v-else class="min-w-0 flex-1 truncate text-label">
            {{ compactTypeLabel || $t('common.notAvailable') }}
          </span>
        </span>
        <span class="instance-inline-compact-status-row">
          <StateTag
            v-if="compactStatusState"
            :value="compactStatusState"
            :policy="compactPolicy"
            class="max-w-full"
          />
        </span>
        <span class="instance-inline-compact-facts">
          <DataBlock
            v-if="resolved && compactDataFields.length"
            :type-id="generatedTypeId"
            :entity="resolved"
            :fields="compactDataFields"
            variant="compact"
          />
        </span>
      </span>
    </span>  </span>

  <span v-else class="instance-inline-tone inline-flex min-w-0 max-w-full items-center align-middle" :class="{ 'pointer-events-none': !interactive }" :style="toneStyle">
    <component
      v-if="resolved && cardComponent"
      :is="cardComponent"
      v-bind="cardProps"
      class="min-w-0 max-w-full"
      data-instance-card-interactive="true"
    />
    <span
      v-else-if="resolved"
      class="instance-inline-chip min-w-0 max-w-full"
      :class="{ 'cursor-pointer': interactive }"
      :role="resolved && interactive ? 'button' : undefined"
      :tabindex="resolved && interactive ? 0 : undefined"
      :title="identityLabel"
      data-instance-card-interactive="true"
      @click="resolved && interactive ? toggleCompactPopup($event) : undefined"
      @keydown="resolved && interactive ? onCompactKeydown($event) : undefined"
    >
      <i v-if="icon" :class="['instance-inline-chip-icon', icon]" aria-hidden="true"></i>
      <span class="instance-inline-chip-label">{{ identityLabel }}</span>
    </span>
    <span v-else class="inline-flex min-w-0 items-center gap-1.5 text-muted" data-instance-card-interactive="true">
      <i :class="icon" class="shrink-0"></i>
      <span class="truncate">{{ resolvedId || $t('common.notAvailable') }}</span>
    </span>
  </span>

  <!-- Shared inspect popover: the compact micro card AND the plain
       inline chip (types without a registered entity card — org-authored
       instances) toggle the same surface. -->
  <Popover v-if="interactive" ref="compactOp">
        <div class="w-[min(34rem,calc(100vw-3rem))]">
          <div class="flex flex-col gap-4 p-4">
            <TraceChain v-if="resolved" :entity="resolved" :type-id="type" />
            <small class="uppercase text-muted text-supporting">
              {{ compactTypeLabel }}
            </small>
            <div v-if="resolved" class="flex flex-wrap items-start justify-between gap-3">
              <span class="min-w-0 truncate" :title="identityLabel">{{ identityLabel }}</span>
              <InstanceState
                v-if="resolved"
                :instance="resolved"
                :type-id="generatedTypeId"
                variant="inline"
              />
            </div>
            <div class="instance-card-popup-content">
              <InstanceSurfaceContent
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
                :aria-label="$t('support.instanceChat')"
                @click="openEntityChatFromRef"
              />
              <GeneratedEditorPageAction
                v-if="popupHasEditorAction"
                :entity="resolved"
                :type-id="generatedTypeId"
              />
              <GeneratedActionButton
                v-for="actionId in popupActionIds"
                :key="actionId"
                :action-id="actionId"
                @execute="executePopupAction"
              />
              <Button
                v-if="detailRoute || directoryOpen"
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
</template>
