<script setup>
import { computed, inject, unref, watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Chip from 'primevue/chip';
import { CHIP_LABEL_PT, INSTANCE_CHIP_CLASS } from './chip-surface.js';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import InstancePreview from '~/components/shared/InstancePreview.vue';
import InstanceActionsPopover from '~/components/shared/InstanceActionsPopover.vue';
import HoverPeek from '~/components/shared/HoverPeek.vue';
import ActionButton from '~/components/ui-mapping/ActionButton.vue';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { normalizeHierarchyType } from '~/utils/instance-hierarchy.js';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { DESIGN_SYSTEM_CARD_COMPONENTS } from '~/utils/design-system-cards.js';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { instanceRecordTitle } from '~/utils/instance-shape.js';
import { generatedEntityLabel, generatedActionLabel } from '~/utils/generated-labels.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { useEntityPopup } from '~/composables/useEntityPopup';

const props = defineProps({
  type: { type: String, required: true },
  id: { type: [String, Number, Object], default: null },
  entity: { type: Object, default: null },
  fetch: { type: Boolean, default: true },
  interactive: { type: Boolean, default: true },
  variant: { type: String, default: 'inline' },
  compactLayout: { type: String, default: 'row' },
  showTypeLabel: { type: Boolean, default: false },
  contextActionEntries: { type: Array, default: () => [] },
  chipClass: { type: [String, Array, Object], default: '' },
  revision: { type: String, default: null },
  active: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false }
});

const emit = defineEmits(['select']);

const loaded = ref(null);
const instances = useInstancesStore();
// The registry touch keeps the declaration-derived display-access
// registration alive for the peek's and micro card's fact rows.
useRegistryStore();
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
const cardComponent = computed(() => DESIGN_SYSTEM_CARD_COMPONENTS[contract.value?.key] || null);
const cardProps = computed(() => ({
  [contract.value?.propName || 'entity']: resolved.value,
  variant: 'inline',
  expandable: props.interactive
}));
// The open reference's hover affordance: one step up the surface ladder.
const hoverSurface = 'transition-colors hover:bg-subtle';
const chipInteractiveClass = `${hoverSurface} rounded-ui`;
const compactInteractiveClass = `${hoverSurface} rounded-panel p-1 -m-1`;
const { typeById } = useFileTypeView();
const compactDisplay = computed(() => resolveInstanceDisplayContract({
  typeId: generatedTypeId.value,
  surface: 'compact',
  typeRecord: typeById(generatedTypeId.value)
}));
const typeView = computed(() => typeById(generatedTypeId.value));
// The served type record's id is the pool key and the policy vocabulary —
// refs may carry alias spellings (useEntityPopup's open follows the same
// law), and the declaration-derived field-access registration keys by it.
const servedTypeId = computed(() => typeView.value?.id || generatedTypeId.value);
const identityLabel = computed(() =>
  instanceRecordTitle(resolved.value, typeView.value) || t('common.unnamed'));
// The version pin (SPEC §24): a locked revision rides the chip as its
// own marker — the ref consumes that revision whatever the source's
// current payload holds.
const chipTitle = computed(() => props.revision
  ? `${identityLabel.value} · ${t('common.pinnedRevision')}`
  : identityLabel.value);
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
// The peek speaks the detail surface, the same field vocabulary the
// record surface renders — the compact card budget stays on cards.
const peekDisplay = computed(() => resolveInstanceDisplayContract({
  typeId: generatedTypeId.value,
  surface: 'detail',
  typeRecord: typeById(generatedTypeId.value)
}));
const peekHasPreview = computed(() => peekDisplay.value.surfaceContract.preview !== 'none');
const peekDataFields = computed(() => peekDisplay.value.fields.filter(field =>
  field.display !== 'entityRef'
  && field.display !== 'entityRefList'
  && field.role !== 'previewSource'
));
const PEEK_FACT_LIMIT = 8;
// The peek speaks the live record: a ref may carry a slim message
// snapshot, so the pool's cached field-bearing DTO (or its on-show
// readable-reference resolution) stands in for the snapshot.
const peekHydrated = ref(null);
const peekEntity = computed(() => {
  const cached = instances.dtoFor(servedTypeId.value, resolvedId.value);
  return [peekHydrated.value, cached].find(dto => dto?.fields && Object.keys(dto.fields).length) || resolved.value;
});
async function onPeekShow() {
  if (!props.fetch || !resolvedId.value) return;
  const cached = instances.dtoFor(servedTypeId.value, resolvedId.value);
  if (cached?.fields && Object.keys(cached.fields).length) return;
  peekHydrated.value = await instances
    .resolveReadableReference(instances.canonicalTypeKey(props.type), resolvedId.value, { silent: true })
    .catch(() => null);
}
// The micro card earns its box: it renders only when the type's compact
// surface carries something to show beside identity — a preview band or
// compact fact rows. Preview-less, fact-less relations render as the
// plain identity chip, so galleries never lay out grids of empty cards
// for data without visual fields.
const compactCardWorthy = computed(() => compactHasPreview.value || compactDataFields.value.length > 0);
const compactTypeLabel = computed(() => contract.value?.labelKey
  ? t(contract.value.labelKey)
  : generatedEntityLabel(generatedTypeId.value || props.type, { t, te }) || props.type);
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
// screen's action executor. No executor in scope means no surface can
// run them, so the ellipsis stays away.
const contextualExecutor = computed(() => (typeof unref(generatedExecuteAction) === 'function'
  ? unref(generatedExecuteAction)
  : null));
const contextualActions = computed(() => {
  if (!props.interactive || !contextualExecutor.value) return [];
  return props.contextActionEntries.map(entry => entry.action).filter(Boolean);
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

// The tile's one activation path: a selectable tile is a list row (the
// click emits `select`); every other tile keeps the ref law and opens
// the record popup.
function onTileActivate(event) {
  if (isInteractiveEventTarget(event)) return;
  if (props.selectable) {
    emit('select', { entity: resolved.value, id: resolvedId.value });
    return;
  }
  openRefPopup(event);
}

function onTileKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onTileActivate(event);
}

function executeContextualAction(action) {
  const executor = contextualExecutor.value;
  if (!executor || !resolved.value) return;
  const contextual = props.contextActionEntries.find(entry => entry.action?.id === action.id);
  executor(action, contextual?.entity || resolved.value, contextual?.context || {});
}
</script>

<template>
  <span
    class="inline-flex min-w-0 max-w-full items-center gap-1 align-middle"
    :class="[
      (variant === 'tile' && resolved)
        || (variant === 'compact' && compactCardWorthy)
        || (variant === 'option' && resolved) ? 'w-full' : null,
      { 'pointer-events-none': !interactive }
    ]"
  >
    <span
      v-if="variant === 'tile' && resolved"
      class="instance-inline-tile flex min-w-0 max-w-full w-full items-stretch gap-3 rounded-ui border border-content-border bg-content p-2 transition-colors"
      :class="[
        { 'border-primary': active },
        (selectable && interactive) || refOpenable ? 'cursor-pointer hover:bg-subtle' : null
      ]"
      :role="selectable ? 'option' : (refOpenable ? 'button' : undefined)"
      :tabindex="(selectable && interactive) || refOpenable ? 0 : undefined"
      :aria-selected="selectable ? active : undefined"
      :data-instance-card-interactive="interactive ? 'true' : undefined"
      @click="onTileActivate($event)"
      @keydown="onTileKeydown($event)"
    >
      <span
        v-if="compactHasPreview"
        :class="LAYOUT.previewSideRow"
        class="instance-preview-slot"
      >
        <InstancePreview
          :entity="resolved"
          :type-id="generatedTypeId"
          :mode="compactDisplay.surfaceContract.preview"
          hide-dimension-layer
        />
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-2">
        <span :class="LAYOUT.rowBetween">
          <span class="flex min-w-0 items-center gap-2">
            <i v-if="icon" :class="icon" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-label" :title="identityLabel">{{ identityLabel }}</span>
          </span>
          <StateTag
            v-if="compactStatusState"
            :value="compactStatusState"
            :policy="compactPolicy"
            class="max-w-full shrink-0"
          />
        </span>
        <TraceChain
          :entity="resolved"
          :type-id="generatedTypeId"
          variant="compact"
          expandable
          class="min-w-0"
        />
        <span v-if="compactDataFields.length" :class="LAYOUT.labeledBlock">
          <DataBlock
            :type-id="generatedTypeId"
            :entity="resolved"
            :fields="compactDataFields"
            variant="compact"
          />
        </span>
      </span>
      <span v-if="$slots.trailing" class="inline-flex flex-none items-center" @click.stop>
        <slot name="trailing" />
      </span>
    </span>

    <span
      v-else-if="variant === 'compact' && compactCardWorthy"
      class="instance-inline-compact min-w-0 max-w-full flex-1"
      :class="[
        { 'cursor-pointer': refOpenable },
        refOpenable ? compactInteractiveClass : null,
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
        :class="compactLayout === 'stacked' ? 'bg-subtle' : 'instance-preview-slot'"
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
            <!-- One caption line: identity truncates, the state tag stays
                 whole. -->
            <StateTag
              v-if="compactStatusState"
              :value="compactStatusState"
              :policy="compactPolicy"
              class="max-w-full shrink-0"
            />
          </template>
          <Chip
            v-else-if="resolved"
            :label="identityLabel"
            :icon="icon || undefined"
            :pt="CHIP_LABEL_PT"
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
            :type-id="servedTypeId"
            :entity="resolved"
            :fields="compactDataFields"
            variant="compact"
          />
        </span>
      </span>
    </span>

    <span
      v-else-if="variant === 'option' && resolved"
      class="instance-option-row min-w-0 max-w-full flex-1"
    >
      <span
        class="instance-option-row-thumb rounded-ui overflow-hidden"
        :class="compactHasPreview ? 'instance-preview-slot' : 'text-muted'"
      >
        <InstancePreview
          v-if="compactHasPreview"
          :entity="resolved"
          :type-id="generatedTypeId"
          :mode="compactDisplay.surfaceContract.preview"
          hide-dimension-layer
        />
        <i v-else-if="icon" :class="icon" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1 truncate" :title="identityLabel">{{ identityLabel }}</span>
      <span
        v-if="showTypeLabel && compactTypeLabel"
        class="max-w-48 shrink-0 truncate text-muted text-supporting"
        :title="compactTypeLabel"
      >{{ compactTypeLabel }}</span>
      <StateTag
        v-if="compactStatusState"
        :value="compactStatusState"
        :policy="compactPolicy"
        class="max-w-full shrink-0"
      />
    </span>

    <template v-else>
      <component
        :is="cardComponent"
        v-if="resolved && cardComponent"
        v-bind="cardProps"
        class="min-w-0 max-w-full"
        data-instance-card-interactive="true"
      />
      <!-- The identity chip is the popup trigger and the peek trigger:
           hover raises the record peek (SPEC §22.14), click opens the
           record popup. -->
      <HoverPeek v-else-if="resolved" :enabled="interactive" @show="onPeekShow">
        <template #default="{ peekEvents }">
          <Chip
            v-on="peekEvents"
            :label="identityLabel"
            :icon="icon || undefined"
            :pt="CHIP_LABEL_PT"
            :class="[INSTANCE_CHIP_CLASS, chipClass, { 'cursor-pointer': refOpenable }, refOpenable ? chipInteractiveClass : null]"
            :role="refOpenable ? 'button' : undefined"
            :tabindex="refOpenable ? 0 : undefined"
            :title="chipTitle"
            data-instance-card-interactive="true"
            @click="openRefPopup($event)"
            @keydown="onRefKeydown($event)"
          />
        </template>
        <template #preview>
          <span
            v-if="peekHasPreview"
            class="instance-preview-slot block h-28 w-full overflow-hidden rounded-ui border border-content-border bg-subtle"
          >
            <InstancePreview
              :entity="peekEntity"
              :type-id="generatedTypeId"
              :mode="peekDisplay.surfaceContract.preview"
              fill
              hide-dimension-layer
            />
          </span>
          <span class="flex min-w-0 flex-col gap-2">
            <span class="flex min-w-0 items-center gap-2">
              <i v-if="icon" :class="icon" class="shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate text-label" :title="identityLabel">{{ identityLabel }}</span>
              <StateTag
                v-if="compactStatusState"
                :value="compactStatusState"
                :policy="compactPolicy"
                class="max-w-full shrink-0"
              />
            </span>
            <DataBlock
              v-if="peekDataFields.length"
              :type-id="servedTypeId"
              :entity="peekEntity"
              :fields="peekDataFields"
              :field-limit="PEEK_FACT_LIMIT"
              variant="compact"
            />
          </span>
        </template>
      </HoverPeek>
      <span v-else class="inline-flex min-w-0 items-center gap-1.5 text-muted" data-instance-card-interactive="true">
        <i :class="icon" class="shrink-0"></i>
        <span class="truncate">{{ resolvedId ? unresolvedLabel : $t('common.notAvailable') }}</span>
      </span>
      <i
        v-if="revision && resolved"
        class="pi pi-lock shrink-0 text-muted"
        :title="$t('common.pinnedRevision')"
        aria-hidden="true"
      />
    </template>

    <InstanceActionsPopover v-if="contextualActions.length">
      <ActionButton
        v-for="action in contextualActions"
        :key="action.id"
        :action="action"
        :state-policy="compactPolicy"
        :label="generatedActionLabel(action, action.id, { t, te })"
        menu-item
        @run="executeContextualAction"
      />
    </InstanceActionsPopover>
  </span>
</template>
