<script setup>
import { computed, defineAsyncComponent, inject, unref, watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Chip from 'primevue/chip';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import InstancePreview from '~/components/shared/InstancePreview.vue';
import InstanceActionsPopover from '~/components/shared/InstanceActionsPopover.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { useInstancesStore } from '~/stores/instances';
import { normalizeHierarchyType } from '~/utils/instance-hierarchy.js';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { instanceRecordTitle } from '~/utils/instance-shape.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { useEntityPopup } from '~/composables/useEntityPopup';

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
  interactive: { type: Boolean, default: true },
  variant: { type: String, default: 'inline' },
  compactLayout: { type: String, default: 'row' },
  contextActionEntries: { type: Array, default: () => [] },
  chipClass: { type: [String, Array, Object], default: '' }
});

const loaded = ref(null);
const authStore = useAuthStore();
const instances = useInstancesStore();
const { t, te } = useI18n();
const entityContext = inject('entityContext', null);
const generatedExecuteAction = inject('generatedExecuteAction', null);
const normalizedId = computed(() => props.id?.toString?.() || props.id || '');
const contract = computed(() =>
  DESIGN_SYSTEM_ENTITY_CONTRACTS.find(entry => entry.key === props.type || entry.typeId === props.type) || null
);
const generatedTypeId = computed(() => contract.value?.typeId || normalizeHierarchyType(props.type));
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
const resolved = computed(() => hydrated.value || props.entity || contextEntity.value || loaded.value);
const resolvedId = computed(() => normalizedId.value
  || resolved.value?._id?.toString?.()
  || resolved.value?.id?.toString?.()
  || resolved.value?._id
  || ''
);
const icon = computed(() => instances.iconFor(props.type));
const cardComponent = computed(() => CARD_COMPONENTS[contract.value?.key] || null);
const cardProps = computed(() => ({
  [contract.value?.propName || 'entity']: resolved.value,
  variant: 'inline',
  expandable: props.interactive
}));
const chipPt = { label: { class: 'truncate' } };
const { typeById } = useFileTypeView();
const compactDisplay = computed(() => resolveInstanceDisplayContract({
  typeId: generatedTypeId.value,
  surface: 'compact',
  typeRecord: typeById(generatedTypeId.value)
}));
const typeView = computed(() => typeById(generatedTypeId.value));
const identityLabel = computed(() =>
  instanceRecordTitle(resolved.value, typeView.value) || t('common.unnamed'));
const unresolvedLabel = computed(() => generatedEntityLabel(
  generatedTypeId.value || props.type,
  { t, te }
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
// plain identity chip, so galleries never lay out grids of empty cards
// for data without visual fields.
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

// The record preview popup is the shared entity popup: it hosts the
// referenced record's compiled detail screen through the generator host.
// A type with no record surface (useEntityPopup's openable law) renders
// an inert chip — no dead link, no hand-rolled preview shell.
const { open: openEntityPopup, openable: entityPopupOpenable } = useEntityPopup();
const refOpenable = computed(() => Boolean(resolved.value)
  && props.interactive
  && entityPopupOpenable(generatedTypeId.value));

// Per-ref contextual operations (a relation's Unlink arrives as a bound
// contextActionEntries row from the owning surface): the ref's own
// ellipsis carries them, executed through the surrounding generated
// screen's action executor.
const contextualActions = computed(() => {
  if (!props.interactive || !Array.isArray(props.contextActionEntries)) return [];
  return props.contextActionEntries
    .map(entry => authStore.actionManifest.find(action => action.id === entry.id))
    .filter(Boolean);
});

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

function openRefPopup(event) {
  if (!refOpenable.value) return;
  if (isInteractiveEventTarget(event)) return;
  openEntityPopup({ typeId: generatedTypeId.value, instanceId: resolvedId.value });
}

function onRefKeydown(event) {
  if (!refOpenable.value) return;
  if (isInteractiveEventTarget(event)) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openRefPopup(event);
}

function executeContextualAction(action) {
  const executor = unref(generatedExecuteAction);
  if (typeof executor !== 'function' || !resolved.value) return;
  const contextual = props.contextActionEntries.find(entry => entry.id === action.id);
  executor(action, contextual?.entity || resolved.value, contextual?.context || {});
}
</script>

<template>
  <span
    class="inline-flex min-w-0 max-w-full items-center gap-1 align-middle"
    :class="[
      variant === 'compact' && compactCardWorthy ? 'w-full' : null,
      { 'pointer-events-none': !interactive }
    ]"
  >
    <span
      v-if="variant === 'compact' && compactCardWorthy"
      class="instance-inline-compact min-w-0 max-w-full flex-1"
      :class="[
        { 'cursor-pointer': refOpenable },
        compactLayout === 'stacked' ? 'instance-inline-compact--stacked' : null
      ]"
      :role="refOpenable ? 'button' : undefined"
      :tabindex="refOpenable ? 0 : undefined"
      :data-instance-card-interactive="interactive ? 'true' : undefined"
      @click="openRefPopup($event)"
      @keydown="onRefKeydown($event)"
    >
      <span
        v-if="resolved && compactHasPreview"
        class="instance-inline-compact-preview"
        :class="compactLayout === 'stacked' ? 'bg-subtle' : null"
        data-instance-card-interactive="true"
      >
        <InstancePreview
          :entity="resolved"
          :type-id="generatedTypeId"
          :mode="compactDisplay.surfaceContract.preview"
          hide-dimension-layer
        />
      </span>
      <span
        class="instance-inline-compact-main"
        :class="compactLayout === 'stacked' ? 'border-t border-content-border p-2' : null"
      >
        <span class="instance-inline-compact-header">
          <template v-if="compactLayout === 'stacked' && resolved">
            <i v-if="icon" :class="icon" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-supporting" :title="identityLabel">{{ identityLabel }}</span>
            <!-- One caption line: identity truncates, the small state
                 tag stays whole. -->
            <StateTag
              v-if="compactStatusState"
              :value="compactStatusState"
              :policy="compactPolicy"
              small
              class="max-w-full shrink-0"
            />
          </template>
          <Chip
            v-else-if="resolved"
            :label="identityLabel"
            :icon="icon || undefined"
            :pt="chipPt"
            class="min-w-0 max-w-full flex-1"
            :title="identityLabel"
          />
          <span v-else class="min-w-0 flex-1 truncate text-label">
            {{ compactTypeLabel || $t('common.notAvailable') }}
          </span>
        </span>
        <span v-if="compactLayout !== 'stacked'" class="instance-inline-compact-status-row">
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
    </span>

    <template v-else>
      <component
        :is="cardComponent"
        v-if="resolved && cardComponent"
        v-bind="cardProps"
        class="min-w-0 max-w-full"
        data-instance-card-interactive="true"
      />
      <Chip
        v-else-if="resolved"
        :label="identityLabel"
        :icon="icon || undefined"
        :pt="chipPt"
        class="min-w-0 max-w-full"
        :class="[chipClass, { 'cursor-pointer': refOpenable }]"
        :role="refOpenable ? 'button' : undefined"
        :tabindex="refOpenable ? 0 : undefined"
        :title="identityLabel"
        data-instance-card-interactive="true"
        @click="openRefPopup($event)"
        @keydown="onRefKeydown($event)"
      />
      <span v-else class="inline-flex min-w-0 items-center gap-1.5 text-muted" data-instance-card-interactive="true">
        <i :class="icon" class="shrink-0"></i>
        <span class="truncate">{{ resolvedId ? unresolvedLabel : $t('common.notAvailable') }}</span>
      </span>
    </template>

    <InstanceActionsPopover v-if="contextualActions.length">
      <GeneratedActionButton
        v-for="action in contextualActions"
        :key="action.id"
        :action-id="action.id"
        menu-item
        @execute="executeContextualAction"
      />
    </InstanceActionsPopover>
  </span>
</template>
