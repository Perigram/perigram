<template>
  <!-- An empty child collection renders its section title with its create
       set directly beneath (owner direction 2026-11-13) — packed beside
       its peers, with no count chip. A stub with no affordance renders
       nothing. -->
  <template v-if="stubLine">
    <div v-if="createControls.length || linkControls.length" class="flex w-fit max-w-full flex-col gap-1">
      <span :class="LAYOUT.sectionTitle">{{ regionLabel }}</span>
      <div :class="LAYOUT.row">
        <CreateControl
          v-for="control in createControls"
          :key="control.action.id"
          :action="control.action"
          :group="control.group"
          :label="createControlLabel(control)"
          :state-policy="node.statePolicy"
          @run="emitRun"
        />
        <ActionButton
          v-for="action in linkControls"
          :key="`link:${action.id}`"
          :action="action"
          :state-policy="node.statePolicy"
          :label="stubLinkLabel(action)"
          @run="emitRun"
        />
      </div>
    </div>
  </template>
  <div v-else-if="node.surfaceKind === 'list'" :class="[listStack, listWidth]">
    <!-- SPEC §22.15: the header stays one line while the row has room —
         the label and its create set lead, the search and view setup
         trail, the label yields first through ellipsis, and the setup
         wraps below only when the label is at its floor. -->
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span :class="['min-w-0 truncate', embedded ? 'text-label' : 'text-section-heading']">{{ regionLabel }}</span>
        <!-- SPEC §22.8: the count renders only for loaded, accessible,
             non-empty collections — a denied or failed source has no
             count, and an empty one states itself through its message. -->
        <Tag v-if="showSurfaces && hasInstances" class="shrink-0" :value="String(node.instances.length)" severity="secondary" />
        <CreateControl
          v-for="control in createControls"
          :key="control.action.id"
          :action="control.action"
          :group="control.group"
          :state-policy="node.statePolicy"
          :label="createControlLabel(control)"
          @run="emitRun"
        />
        <ActionButton
          v-for="action in linkControls"
          :key="`link:${action.id}`"
          :action="action"
          :state-policy="node.statePolicy"
          :label="sectionLinkLabel(action)"
          @run="emitRun"
        />
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <IconField v-if="searchOpen" class="w-44">
          <InputIcon class="pi pi-search cursor-pointer" @click="closeSearch" />
          <InputText
            ref="searchInput"
            v-model="search"
            size="small"
            class="w-full"
            :placeholder="$t('uiMapping.searchPlaceholder')"
            :aria-label="$t('uiMapping.searchPlaceholder')"
            @keydown.esc="closeSearch"
            @blur="search || closeSearch()"
          />
        </IconField>
        <Button
          v-else-if="searchToggleAvailable"
          icon="pi pi-search"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('uiMapping.searchPlaceholder')"
          :title="$t('uiMapping.searchPlaceholder')"
          @click="openSearch"
        />
        <Button
          v-if="viewSettingsAvailable"
          icon="pi pi-sliders-h"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('uiMapping.viewSettings')"
          :title="$t('uiMapping.viewSettings')"
          :badge="conditionCount ? String(conditionCount) : null"
          @click="toggleViewSettings"
        />
        <Popover ref="viewPopover">
          <div class="flex w-96 flex-col gap-3">
            <div v-if="layoutOptions.length > 1" class="flex flex-col gap-2">
              <span :class="LAYOUT.sectionTitle">{{ $t('uiMapping.view') }}</span>
              <div class="grid grid-cols-2 gap-1">
                <button
                  v-for="option in layoutOptions"
                  :key="option.id"
                  type="button"
                  class="flex min-w-0 flex-col items-center gap-1 rounded-ui border p-2 text-label transition-colors"
                  :class="option.active
                    ? 'border-primary bg-primary-surface text-primary'
                    : 'border-content-border text-muted hover:bg-subtle'"
                  :aria-pressed="option.active"
                  @click="selectLayoutOption(option)"
                >
                  <i :class="option.icon" />
                  <span class="truncate">{{ option.label }}</span>
                </button>
              </div>
            </div>
            <div v-if="filterToggleAvailable" class="flex flex-col gap-2">
              <span :class="LAYOUT.sectionTitle">{{ $t('uiMapping.filters') }}</span>
              <FilterBuilder
                :model-value="builderFilter"
                :fields="builderFields"
                @update:model-value="value => (builderFilter = value)"
              />
            </div>
            <div v-if="sortToggleAvailable" class="flex flex-col gap-2">
              <span :class="LAYOUT.sectionTitle">{{ $t('uiMapping.sortLabel') }}</span>
              <SortControl
                inline
                :options="sortOptions"
                :model-value="sortName"
                :order="sortOrder"
                @update:model-value="value => (sortName = value)"
                @update:order="value => (sortOrder = value)"
              />
            </div>
            <div v-if="fieldOptions.length" class="flex flex-col gap-2">
              <span :class="LAYOUT.sectionTitle">{{ $t('uiMapping.fields') }}</span>
              <div class="flex flex-col gap-1">
                <div
                  v-for="field in fieldOptions"
                  :key="field.name"
                  class="flex items-center gap-2"
                >
                  <Checkbox
                    :model-value="fieldChecked(field.name)"
                    binary
                    size="small"
                    :input-id="`view-field-${field.name}`"
                    @update:model-value="toggleField(field.name)"
                  />
                  <label :for="`view-field-${field.name}`" class="text-label">{{ field.label }}</label>
                </div>
              </div>
            </div>
          </div>
        </Popover>
      </div>
    </div>
    <RegionDataState v-if="showState" :node="node" />
    <div v-if="showSurfaces" :class="[embeddedStack, 'relative']">
      <RegionCollections
        :node="collectionsNode"
        :list-layout="listLayout"
        :filtered-instances="filteredInstances"
        :sorted-instances="sortedInstances"
        :effective-pool="effectivePool"
        :bundle="bundle"
        :openable="openable"
        :parented="parented"
        :instance-actions="instanceActionsForType"
        :relation-unlink="relationUnlink"
        :patchable="patchable"
        :resolve-transitions="resolveTransitions"
        :is-reloading="isReloading"
        @open="emitOpen"
        @run="emitRun"
        @transition="payload => emit('transition', payload)"
        @inline-change="({ instance, change }) => emitPatchFor(instance, change)"
      />
    </div>
    <RegionChildren
      v-if="node.childRegions.length"
      :regions="node.childRegions"
      :arrangement="node.childArrangement"
      :depth="depth"
      :pool="pool"
      :bundle="bundle"
      :openable="openable"
      :instance-actions="instanceActions"
      @run="emitRun"
      @open="emitOpen"
    />
  </div>

  <div v-else :class="[stackFor, 'w-full', 'relative', 'h-full', 'min-h-0', recordDocument && !editorSurface ? LAYOUT.measure : '']">
    <RegionDataState v-if="showState" :node="node" />
    <template v-if="depth === 0">
      <!-- The editor page (SPEC §4, owner direction 2026-11-07): a
           depth-0 record of an editor-bound type on an open page surface
           renders the editor flush under the unified header — the
           document anatomy stays off editor pages. -->
      <template v-if="showSurfaces && editorSurface">
        <template v-if="editorSurface.workspacePage?.ownsChrome">
          <!-- An ownsChrome editor record (SPEC §4): the editor owns the
               page — its file panel carries the identity — so the
               unified header stays off; the pane's Back control alone
               rides above when navigation history exists. -->
          <div v-if="navigation" class="flex px-1 pt-1">
            <BackControl :back="navigation" />
          </div>
          <div class="flex min-h-0 flex-1 flex-col">
            <RecordEditorBody
              :key="node.typeId"
              :surface="editorSurface"
              :instance="node.instances[0]"
              :type="node.type"
            />
          </div>
        </template>
        <template v-else>
          <div class="relative">
            <SurfaceHeader
              :type="node.type"
              :instance="node.instances[0]"
              :actions="headerActions"
              :level="node.level"
              :bundle="bundle"
              :state-policy="node.statePolicy"
              :navigation="depth === 0 ? navigation : null"
              :chrome="editorChrome"
              @run="action => emitRun(action, { instance: node.instances[0] || null })"
              @transition="payload => emit('transition', { ...payload, instance: node.instances[0] })"
              @refresh="emit('refresh')"
              @open-instance="emitOpen"
            />
            <!-- The record's reload lane: a permanent 4px track under the
               header the strip appears inside — bounded, touching no
               content, and its appearance shifts nothing below. -->
            <div :class="LAYOUT.reloadLane">
              <ProgressBar v-if="isReloading" mode="indeterminate" class="h-full" :aria-label="$t('uiMapping.loadingRegion')" />
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col">
            <RecordEditorBody
              :key="node.typeId"
              :surface="editorSurface"
              :instance="node.instances[0]"
              :type="node.type"
              :chrome="editorChrome"
            />
          </div>
        </template>
      </template>
      <template v-else-if="showSurfaces">
        <div class="relative">
          <Teleport :to="headerTarget || 'body'" :disabled="!headerTarget">
            <SurfaceHeader
              :type="node.type"
              :instance="node.instances[0]"
              :actions="headerActions"
              :level="node.level"
              :bundle="bundle"
              :state-policy="node.statePolicy"
              :navigation="depth === 0 ? navigation : null"
              :compact="presentation === 'peek'"
              :expandable="expandable"
              :on-rename="recordRename"
              @run="action => emitRun(action, { instance: node.instances[0] || null })"
              @transition="payload => emit('transition', { ...payload, instance: node.instances[0] })"
              @refresh="emit('refresh')"
              @open-instance="emitOpen"
              @expand="emit('expand')"
            >
              <template #cluster>
                <Button
                  v-if="recordOverlaySession?.dirty"
                  :label="t('common.save')"
                  icon="pi pi-save"
                  size="small"
                  text
                  severity="secondary"
                  :loading="recordOverlaySession.saving"
                  @click="saveOverlay"
                />
              </template>
            </SurfaceHeader>
          </Teleport>
          <!-- The record's reload lane: a permanent 4px track under the
               header the strip appears inside — bounded, touching no
               content, and its appearance shifts nothing below. -->
          <div :class="LAYOUT.reloadLane">
            <ProgressBar v-if="isReloading" mode="indeterminate" class="h-full" :aria-label="$t('uiMapping.loadingRegion')" />
          </div>
        </div>
        <div v-if="splitSide && presentation !== 'peek'" class="region-split grid w-full grid-cols-1 gap-6" :style="splitTracks">
          <div class="min-w-0 flex flex-col gap-6">
            <SurfaceBody
              v-bind="bodyProps"
              variant="full"
              :editable="patchable"
              v-on="bodyEvents"
            />
          </div>
          <PlacementBox>
            <RegionChildren
              v-bind="childrenProps"
              v-on="childrenEvents"
            />
          </PlacementBox>
        </div>
        <template v-else>
          <!-- The document flow rides the section step (SPEC §22.9): the
               body's sections, the appended collection sections, and the
               trailing line are document blocks on one rhythm. -->
          <div :class="spacing ? spacing.screenRoot : LAYOUT.stackSection" class="min-w-0 flex flex-col">
            <SurfaceBody
              v-bind="bodyProps"
              variant="full"
              :editable="patchable"
              v-on="bodyEvents"
            >
              <template #document-section="{ section }">
                <DocumentSectionShell
                  :session="recordOverlaySession"
                  :section-key="section.key"
                  :index="section.index"
                  :block="section.block || null"
                >
                  <RegionChildren
                    v-if="childRegionFor(section.key)"
                    v-bind="childrenProps"
                    v-on="childrenEvents"
                    :regions="[childRegionFor(section.key)]"
                  />
                  <OverlayTextBlock
                    v-else-if="section.block?.kind === 'text'"
                    :block="section.block"
                    :session="recordOverlaySession"
                  />
                  <ViewEmbed
                    v-else-if="section.block?.kind === 'view'"
                    :view-id="section.block.view?.id || ''"
                    :type-id="section.block.view?.typeId || ''"
                    :fallback-name="section.block.view?.name || ''"
                  />
                </DocumentSectionShell>
              </template>
            </SurfaceBody>
            <!-- The appended collection sections (children when no overlay
                 composes them into the flow, the empty stubs) render on the
                 same document rhythm. -->
            <RegionChildren
              v-if="node.childRegions.length && !documentComposing && presentation !== 'peek'"
              v-bind="childrenProps"
              v-on="childrenEvents"
              :arrangement="node.childArrangement"
            />
            <RegionChildren
              v-if="node.stubRegions?.length && !editorSurface && presentation !== 'peek'"
              v-bind="childrenProps"
              v-on="childrenEvents"
              :regions="node.stubRegions"
              :arrangement="{ mode: 'stack' }"
              pack
            />
            <!-- The document's trailing line (SPEC §26): always mounted
                 while no block editor holds focus — the page document ends
                 with it. -->
            <TrailingTextBlock v-if="recordOverlaySession" :session="recordOverlaySession" />
          </div>
        </template>
      </template>
    </template>
    <template v-else-if="showSurfaces">
      <ProgressBar v-if="isReloading" mode="indeterminate" :class="LAYOUT.reloadBar" :aria-label="$t('uiMapping.loadingRegion')" />
      <SurfaceBody
        v-bind="bodyProps"
        :variant="node.variant"
        v-on="bodyEvents"
      />
      <RegionChildren
        v-if="node.childRegions.length && presentation !== 'peek'"
        v-bind="childrenProps"
        v-on="childrenEvents"
        :arrangement="node.childArrangement"
      />
      <RegionChildren
        v-if="node.stubRegions?.length && presentation !== 'peek'"
        v-bind="childrenProps"
        v-on="childrenEvents"
        :regions="node.stubRegions"
        :arrangement="{ mode: 'stack' }"
        pack
      />
    </template>
    <ViewPickerDialog
      :visible="recordOverlaySession !== null && recordOverlaySession.viewPickerAt !== null"
      @close="recordOverlaySession?.closeViewPicker()"
      @pick="view => recordOverlaySession?.pickView(view)"
    />
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ProgressBar from 'primevue/progressbar';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Checkbox from 'primevue/checkbox';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import { useToast } from 'primevue/usetoast';
import {
  LAYOUT, GAP_BY_LEVEL, sortControlRows,
  hasStateVocabulary, localizedLabel, typeLabelKey, instanceMatchesToolbar,
  listLayoutOf, titleFor, createActionControls, recordChildSectionKey,
  isIdentifierField
} from '#shared/ui-mapping/index.js';
import { instanceMatchesFilter, countPredicates } from '#shared/instance-filters/index.js';
import { builderFieldsForType } from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference, loadProjectionPreference, storeProjectionPreference, loadFilterViewState, storeFilterViewState, loadFieldPreference, storeFieldPreference } from '~/utils/ui-view-state.js';
import { normalizeFilter } from '#shared/instance-filters/index.js';
import SurfaceBody from './SurfaceBody.vue';
import SortControl from './SortControl.vue';
import CreateControl from './CreateControl.vue';
import SurfaceHeader from './SurfaceHeader.vue';
import BackControl from '../shared/BackControl.vue';
import RecordEditorBody from '~/components/generated/RecordEditorBody.vue';
import { createEditorChrome } from '~/components/generated/editor-page-chrome.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';
import FilterBuilder from '../shared/FilterBuilder.vue';
import RegionDataState from './RegionDataState.vue';
import RegionCollections from './RegionCollections.vue';
import RegionChildren from './RegionChildren.vue';
import PlacementBox from './PlacementBox.vue';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import { useRecordOverlaySession } from '~/composables/useRecordOverlay.js';
import { useInstanceOverlaysStore } from '~/stores/instance-overlays';
import { generatedEntityLabel, generatedActionLabel } from '~/utils/generated-labels.js';
import { isRelationLinkAction, isRelationUnlinkAction } from '~/utils/action-visibility.js';
import ActionButton from './ActionButton.vue';
import DocumentSectionShell from './DocumentSectionShell.vue';
import OverlayInsertControl from './OverlayInsertControl.vue';
import OverlayTextBlock from '~/components/generated/OverlayTextBlock.vue';
import TrailingTextBlock from '~/components/generated/TrailingTextBlock.vue';
import ViewEmbed from '~/components/generated/ViewEmbed.vue';
import ViewPickerDialog from '~/components/generated/ViewPickerDialog.vue';
const props = defineProps({
  node: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Lazy type loader for the children-type overlay (the children columns
  // resolve their chips from the pool): `async (typeId) => screenInstance[]`,
  // owned by the app host that owns the instance store.
  loadType: { type: Function, default: null },
  depth: { type: Number, default: 0 },
  embedded: { type: Boolean, default: false },
  // Collection identities render as links when an instance-open handler
  // exists upstream (GeneratedMappingScreen onOpen).
  openable: { type: Boolean, default: false },
  // Per-instance quick actions by type id (resolveInstanceActions map).
  instanceActions: { type: Object, default: null },
  // Whether the detail affordances may persist edits (the engine binds
  // this to the presence of an onPatch executor).
  patchable: { type: Boolean, default: false },
  // Machine-authority transition resolver for board drags (the host's state
  // service): passed through to the board projection.
  resolveTransitions: { type: Function, default: null },
  // Host-injected contextual back affordance for the record header
  // (`{ icon, label, command }` — SurfaceHeader's navigation channel).
  navigation: { type: Object, default: null },
  // Host-owned DOM target for the depth-0 record header.
  headerTarget: { type: Object, default: null },
  // The depth-0 detail treatment: `record` renders the record header's
  // page chrome; `peek` renders its compact identity line over the body.
  presentation: { type: String, default: 'record' },
  // Host-selected step-up affordance on the depth-0 header.
  expandable: { type: Boolean, default: false },
  // The stub slot (SPEC → Placement-aware composition): an inert child
  // renders one compact line — label, count, its own create action.
  stub: { type: Boolean, default: false },
  // A saved view's state (SPEC §26): when present, the region renders
  // the saved lens — the view models seed from it and persist nowhere.
  viewState: { type: Object, default: null },
  // Host-provided section title (the saved view's name on page embeds).
  label: { type: String, default: '' }
});

const emit = defineEmits(['run', 'transition', 'open', 'patch', 'refresh', 'expand']);
const emitOpen = instance => emit('open', instance);
// One binding set for the record body and its child regions across the
// split, stack, and nested branches.
const bodyProps = computed(() => ({
  instance: props.node.instances[0],
  type: props.node.type,
  actions: props.node.actions,
  coveredRelations: coveredRelationKeys.value,
  pool: props.pool,
  bundle: props.bundle,
  statePolicy: props.node.statePolicy,
  presentation: props.presentation,
  overlay: recordOverlaySaved.value,
  childSections: recordChildSections.value
}));
const childrenProps = computed(() => ({
  regions: props.node.childRegions,
  depth: props.depth,
  pool: props.pool,
  bundle: props.bundle,
  openable: props.openable,
  instanceActions: props.instanceActions
}));
// The record page's weight-proportional split: the side-rail outcome the
// host's width step engages (wide hosts only), the side column's grid
// share earned by the children's weight (REGION_SIDE_SPANS over the
// 12-track record grid). Narrower hosts take the children's own step
// outcome below the body.
const hostContainer = useHostContainerTraits();
const childOutcome = computed(() => props.node.childArrangement?.[hostContainer.value.width] || { mode: 'stack' });
const splitSide = computed(() => props.depth === 0 && childOutcome.value.mode === 'side');
const splitTracks = computed(() => ({
  gridTemplateColumns: `minmax(0, ${12 - (childOutcome.value.span || 3)}fr) minmax(0, ${childOutcome.value.span || 3}fr)`
}));
const { te, t } = useI18n();
// The nearest toast host may be absent in isolated mounts.
let toast = null;
try { toast = useToast(); } catch { toast = null; }
const spacing = inject('uiMappingSpacing', null);
// The record page is a document (SPEC §22.17): the depth-0 record in the
// `record` presentation renders one inline stack at the measure — the
// composed arrangement already resolves the stack and the measure
// centers and bounds it. Editor-bound types resolve the editor page
// instead (SPEC §4).
const recordDocument = computed(() => props.depth === 0
  && props.presentation === 'record'
  && props.node.surfaceKind === 'detail');
const instanceId = computed(() => {
  const id = props.node.instances[0]?._id ?? props.node.instances[0]?.id;
  return id ? String(id) : '';
});
const recordTitle = computed(() => titleFor(props.node.instances[0], props.node.type, { unnamedLabel: t('common.unnamed') }));

// The editor page (SPEC §4, owner direction 2026-11-07): the depth-0
// record of an editor-bound type on an open page surface — the editor
// owns the page flush under the unified header, and the document
// anatomy stays off. The record popup keeps its compact document; the
// peek keeps its preview presentation.
const editorSurface = computed(() => {
  if (!recordDocument.value || hostContainer.value?.hostKind === 'popup') return null;
  if (!instanceId.value || !props.node.typeId) return null;
  return resolveFileSurface(null, props.node.typeId);
});
// One chrome channel per mounted record page: the editor module binds
// into it once per mount (the editor body re-keys with the type), so a
// record swap in place keeps the binding live.
let boundEditorChrome = null;
const editorChrome = computed(() => (editorSurface.value
  ? (boundEditorChrome ||= createEditorChrome())
  : null));
const tabKey = inject('workspacePageKey', '');
if (import.meta.client) {
  watch(() => editorChrome.value?.api?.dirty, dirty => {
    setWorkspacePageDirty(tabKey, Boolean(dirty));
  });
}
// The record title's rename channel (SPEC §22.3): the identifier
// field's inline patch — the popup's title stays read-only and editor
// pages rename through the chrome channel.
const identifierName = computed(() => Object.keys(props.node.type?.fields || {})
  .find(name => isIdentifierField(props.node.type, name)) || null);
const recordRename = computed(() => {
  if (!recordDocument.value || editorSurface.value
    || hostContainer.value?.hostKind === 'popup'
    || !props.patchable || !identifierName.value) return null;
  const instance = props.node.instances[0];
  return name => emitPatchFor(instance, { [identifierName.value]: name });
});

// The instance overlay (SPEC §26) rides the record page alone: the
// document branch of the depth-0 record in the `record` presentation on
// routed and pane hosts — the popup and every peek/nested surface keep
// their own presentations. Readers get the saved composition applied;
// write-grant holders get the authoring session over it (the
// file-surfaces write-grant seam decides).
const overlaysStore = useInstanceOverlaysStore();
const recordOverlayHost = computed(() => recordDocument.value
  && !editorSurface.value
  && hostContainer.value?.hostKind !== 'popup'
  && Boolean(instanceId.value)
  && Boolean(props.node.typeId));
const recordOverlayTypeId = computed(() => (recordOverlayHost.value ? String(props.node.typeId) : ''));
const recordOverlayInstanceId = computed(() => (recordOverlayHost.value ? instanceId.value : ''));
const recordOverlaySaved = computed(() => (recordOverlayTypeId.value && recordOverlayInstanceId.value
  ? overlaysStore.overlayFor(recordOverlayTypeId.value, recordOverlayInstanceId.value)
  : null));
const recordChildSections = computed(() => props.node.childRegions
  .map(region => ({ key: recordChildSectionKey(region), region })));
const childRegionByKey = computed(() => new Map(recordChildSections.value.map(section => [section.key, section.region])));
const childRegionFor = key => childRegionByKey.value.get(key) || null;
const recordOverlay = useRecordOverlaySession({
  typeId: recordOverlayTypeId,
  instanceId: recordOverlayInstanceId,
  entity: computed(() => props.node.instances[0] || null),
  active: recordOverlayHost,
  tabKey
});
const recordOverlaySession = computed(() => (recordOverlay.writable ? recordOverlay : null));
provide('recordOverlaySession', recordOverlaySession);
if (import.meta.client) {
  watch([recordOverlayTypeId, recordOverlayInstanceId], ([typeId, overlayInstanceId]) => {
    if (typeId && overlayInstanceId) overlaysStore.ensureLoaded(typeId, overlayInstanceId);
  }, { immediate: true });
}
// The composed document: sections move into the body's flow while an
// overlay or session is live; otherwise the children render after the
// body as today.
const documentComposing = computed(() => recordOverlayHost.value
  && Boolean(recordOverlaySaved.value || recordOverlaySession.value));
async function saveOverlay() {
  try {
    await recordOverlay.save();
  } catch (error) {
    toast?.add?.({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

// A collection's title bar binds to its collection at the tight step
// (owner direction 2026-11-14): the section separation above carries the
// block boundary.
// A list with nothing to show renders at content width — a dead
// collection is a compact stub, never a screen-wide banner.
const listWidth = computed(() => (props.node.surfaceKind === 'list'
  && !props.node.instances.length
  && state.value !== 'loading'
  ? 'w-fit max-w-full' : 'w-full'));
const listStack = computed(() => (spacing ? spacing.stackTight : LAYOUT.stackTight));
const stackFor = computed(() => (spacing ? spacing.stack : LAYOUT[GAP_BY_LEVEL[Math.min(props.node.level, 2)] || 'stack']));

// The containment cross-cut flag: an unscoped list of a type someone's
// children edge names renders every row WITH its ancestry — the lineage
// breadcrumb trail resolves ancestors itself through the instances
// store's readable-reference seam. A list whose own type declares
// children overlays the child types onto the pool so the children
// columns resolve their chips; overlaid types never gate correctness —
// an unloaded type just renders without its context.
const parented = computed(() => props.node.crossCut === true);
const overlayTypeIds = computed(() => [...new Set(
  props.node.surfaceKind === 'list'
    ? Object.values(props.node.type?.edges?.children || {}).flatMap(edge => edge?.types || [])
    : []
)]);
const loadedTypes = ref({});
const effectivePool = computed(() => {
  if (!Object.keys(loadedTypes.value).length) return props.pool;
  const overlay = Object.fromEntries(Object.entries(loadedTypes.value)
    .map(([typeId, byId]) => [typeId, { ...(props.pool[typeId] || {}), ...byId }]));
  return { ...props.pool, ...overlay };
});
async function ensureOverlayTypes() {
  if (!props.loadType) return;
  for (const typeId of overlayTypeIds.value) {
    if (props.pool[typeId] && Object.keys(props.pool[typeId]).length) continue;
    if (loadedTypes.value[typeId]) continue;
    try {
      const rows = await props.loadType(typeId);
      loadedTypes.value = {
        ...loadedTypes.value,
        [typeId]: Object.fromEntries((rows || []).filter(Boolean).map(row => [row.id, row]))
      };
    } catch {
      loadedTypes.value = { ...loadedTypes.value, [typeId]: {} };
    }
  }
}
onMounted(ensureOverlayTypes);
watch(() => [props.node.typeId, props.loadType], ensureOverlayTypes);

// Field-name changes map onto the flat §3 wire patch: the identifier row
// `name` writes the wire name slot, every other field lands under
// `fields.<name>` — the same shape the instance update transport
// (processUpdate) writes server-side.
const wirePatchFor = changes => {
  const patch = {};
  for (const [name, value] of Object.entries(changes)) {
    if (name === 'name') patch.name = value;
    else {
      patch.fields = patch.fields || {};
      patch.fields[name] = value;
    }
  }
  return Object.keys(patch).length ? patch : null;
};
const emitPatchFor = (instance, changes) => {
  const patch = wirePatchFor(changes);
  if (instance && patch) emit('patch', { instance, patch });
};
const emitPatch = changes => emitPatchFor(props.node.instances[0], changes);
const inlineChange = ({ name, value } = {}) => emitPatch({ [name]: value });
const emitRun = (action, context) => emit('run', action, context);
// The header already names the collection's class, so its own create
// collapses to the bare "New"; a create for another type keeps its type
// caption. The empty stub line renders the create alone and keeps the
// full caption.
const createControlLabel = control => (stubLine.value
  ? generatedActionLabel(control.action, control.action.id, { t, te })
  : control.action.typeId === props.node.typeId
    ? localizedLabel({ te, t }, 'uiMapping.new', 'New')
    : null);
const bodyEvents = {
  run: emitRun,
  'inline-change': inlineChange,
  'open-instance': emitOpen
};
const childrenEvents = { run: emitRun, open: emitOpen };
// The section already names its class: a link targeting exactly this
// section's type collapses to the bare "Link".
const sectionLinkLabel = action => {
  const targets = [].concat(action.relationMutation?.targetTypes || action.relation?.targetTypes || []);
  return targets.length === 1 && targets[0] === props.node.typeId
    ? t('common.link')
    : generatedActionLabel(action, action.id, { t, te });
};
// The empty stub line renders its link alone, so the caption names the
// target class.
const stubLinkLabel = action => generatedActionLabel(action, action.id, { t, te });
const instanceActionsForType = computed(() => props.instanceActions?.[props.node.typeId] || []);
// The collection toolbar renders type-level actions only: creates. Every
// other action kind addresses a concrete instance (delete, transitions,
// instance-scoped commands) and renders on the instance surfaces — the
// row menus, the detail header, and the machine-served transitions —
// never beside the create button. Same-type creates collapse to one
// CreateControl whose mode selection names the siblings; creates for
// other types keep their own buttons.
const createControls = computed(() => createActionControls(props.node.actions || []));
// SPEC §22.12: a relation link action renders in the toolbar of the
// relation-scoped section its relation targets (the composition injects
// it with the parent attached); a class list region carries no link —
// the action addresses a concrete parent instance.
const linkControls = computed(() => (props.node.relationParent
  ? (props.node.actions || []).filter(isRelationLinkAction)
  : []));
// Unlink entries for this section's linked rows: the parent record and
// the per-row relation ref travel as the run context.
const relationUnlink = computed(() => {
  const actions = (props.node.actions || []).filter(isRelationUnlinkAction);
  return actions.length && props.node.relationParent ? { parent: props.node.relationParent, actions } : null;
});
// The detail header's action set: the composed node's manifest actions
// PLUS the per-instance quick actions — runtime state transitions, the
// construct re-run, and the derived export affordances the record
// carries (a verb the record supports belongs on its own page, same as
// on its card menu).
const headerActions = computed(() => [
  ...(props.node.actions || []),
  ...instanceActionsForType.value.filter(action => action?.__runtime || action?.__rerun || action?.__command)
]);
// Surface visibility derives from the composed dataState: ready regions
// render; a loading region with already-loaded instances keeps its stale
// surfaces under an indeterminate progress bar; every other state shows
// the shared RegionDataState (skeletons on first load, messages after).
const state = computed(() => props.node.dataState || 'ready');
const hasInstances = computed(() => props.node.instances.length > 0);
const isReloading = computed(() => state.value === 'loading' && hasInstances.value);
const showSurfaces = computed(() => state.value === 'ready' || isReloading.value);
const showState = computed(() => !showSurfaces.value);
const stubLine = computed(() => props.stub && props.node.surfaceKind === 'list'
  && (state.value === 'empty' || state.value === 'missing'));
const embeddedStack = computed(() => (spacing ? spacing.stackTight : LAYOUT.stackTight));
// A provided label wins (the saved view's name on a page embed).
const regionLabel = computed(() => props.label
  || localizedLabel({ te, t }, typeLabelKey(props.node.typeId), props.node.type ? generatedEntityLabel(props.node.type, { t, te }) : props.node.id));
// The derived list layout — the resolver's contract decision over shape,
// class, the served state vocabulary, and the value-aware table
// column signal (listLayoutOf is the one derivation compose-time weights
// read too). The projection switch below is the user's view-state
// override inside a bounded pair, never a second derivation.
const derivedListLayout = computed(() => listLayoutOf(props.node));
// The projection switch rides the same persisted-view-state seam as sort
// and filters: a stateful collection (a served vocabulary spanning at
// least BOARD_MIN_COLUMNS values) whose derived layout is a structural
// collection (table) may board, and a derived board may
// table back. Shape-specialized projections (timeline, stats) never
// switch — the board would fight their shape.
// A stored preference for a non-switchable collection is ignored; a
// stored table preference is the user's explicit view — the table floor
// governs the derivation alone.
const projectionSwitchable = computed(() => hasStateVocabulary(props.node.statePolicy)
  && ['table', 'board'].includes(derivedListLayout.value));
// The saved lens (SPEC §26): a provided view state seeds every view
// model and turns the persistence off — controls stay live, their
// choices stay session-local.
const savedViewState = computed(() => props.viewState || null);
const seedProjection = () => {
  if (savedViewState.value) {
    const projection = savedViewState.value.projection;
    return projection === 'board' || projection === 'table' ? projection : null;
  }
  return loadProjectionPreference(projectionScope.value);
};
const projectionScope = computed(() => `list-projection:${props.node.typeId || ''}`);
const projectionPreference = ref(seedProjection());
watch(projectionScope, () => {
  projectionPreference.value = seedProjection();
});
// A stored table preference is the user's explicit view: the floor
// governs the derivation alone, a chosen table renders.
const listLayout = computed(() => {
  if (projectionPreference.value === 'board' && projectionSwitchable.value) return 'board';
  if (projectionPreference.value === 'table' && derivedListLayout.value === 'board') return 'table';
  return derivedListLayout.value;
});
// Relation keys covered by child regions — filled and stubs alike: a
// stub still owns its relation's surface (the body renders no duplicate
// empty section for it).
const coveredRelationKeys = computed(() => [...props.node.childRegions, ...(props.node.stubRegions || [])]
  .map(child => child.relationKey)
  .filter(Boolean));

// Region-local search state over the composed list-controls contract;
// the query applies client-side over the loaded instances. The filter
// tree is persisted view state per type and is evaluated with the one
// matcher (`instanceMatchesFilter`) against the region's pool. The
// view and filter cluster sits at the header's trailing end (SPEC
// §22.15); the filter badge carries the active condition count.
const search = ref(savedViewState.value?.search || '');
const searchToggleAvailable = computed(() => props.node.surfaceKind === 'list'
  && Boolean(props.node.typeId || props.node.listControls));
// Search stays an icon until pressed, then expands in place; an active
// query keeps it open.
const searchOpen = ref(Boolean(search.value));
const searchInput = ref(null);
function openSearch() {
  searchOpen.value = true;
  nextTick(() => searchInput.value?.$el?.focus?.());
}
function closeSearch() {
  searchOpen.value = false;
}
watch(search, value => {
  if (value) searchOpen.value = true;
});
// Filterable fields: the type's scalar fields plus relation, parent, and
// children traversal axes, with the primary status over the values
// actually present. The name axis always exists, so every list surface
// offers the conditions panel — not only facet-rich ones.
const builderFields = computed(() => [
  {
    name: 'state',
    label: t('uiMapping.fieldStatus'),
    kind: 'enum',
    values: [...new Set(props.node.instances.map(instance => instance?.state).filter(Boolean))].sort()
  },
  ...builderFieldsForType(props.node.type, { bundle: props.bundle })
].filter(field => field.kind !== 'enum' || field.values.length));
const facetsToggleAvailable = computed(() => builderFields.value.length > 0);
// The composed tree is persisted view state per type: it survives
// navigation and reloads (presentation data, never a process contract).
// A saved lens seeds the same model and skips the persistence — the
// stored tree re-validates through normalizeFilter either way.
const builderScope = computed(() => `collection:${props.node.typeId}`);
const seedFilter = () => (savedViewState.value
  ? normalizeFilter(savedViewState.value.filters) || null
  : loadFilterViewState(builderScope.value));
const builderFilter = ref(seedFilter());
watch(builderScope, () => {
  builderFilter.value = seedFilter();
});
watch(builderFilter, filter => {
  if (!savedViewState.value) storeFilterViewState(builderScope.value, filter);
});
// Card ordering rides the view popover's sort keys — the same sortKeys
// contract, shared comparator, and persisted preference (scope kept).
// The sort control serves the card-grid projection (tables sort natively
// by column; the board sorts per column inside BoardCollection, on its
// own scoped preference).
const sortScope = computed(() => `card-grid:${props.node.typeId || ''}`);
const seedSort = () => {
  if (savedViewState.value) {
    const sort = savedViewState.value.sort;
    return sort && typeof sort.name === 'string' && Number.isFinite(sort.order)
      ? { name: sort.name, order: sort.order }
      : null;
  }
  return loadSortPreference(sortScope.value);
};
const preferredSort = seedSort();
const sortName = ref(preferredSort?.name || props.node.listControls?.defaultSort || null);
const sortOrder = ref(preferredSort?.order || 1);
const sortOptions = computed(() => (props.node.listControls?.sortKeys || [])
  .map(key => ({ label: key.label, value: key.name })));
const sortKeyResolved = computed(() => (props.node.listControls?.sortKeys || [])
  .find(key => key.name === sortName.value) || null);
const sortToggleAvailable = computed(() => listLayout.value === 'card-grid' && sortOptions.value.length > 0);
watch([sortName, sortOrder], () => {
  if (savedViewState.value || !sortName.value) return;
  storeSortPreference(sortScope.value, { name: sortName.value, order: sortOrder.value });
});
watch(sortScope, () => {
  const restored = seedSort();
  sortName.value = restored?.name || props.node.listControls?.defaultSort || null;
  sortOrder.value = restored?.order || 1;
});
const sortedInstances = computed(() => (sortKeyResolved.value
  ? sortControlRows(filteredInstances.value, sortKeyResolved.value, sortOrder.value)
  : filteredInstances.value));
watch(() => props.node.id, () => {
  search.value = savedViewState.value?.search || '';
});
const viewPopover = ref();

// View setup's field selection (SPEC §26): the user's explicit column
// set per type, derived when absent.
const fieldsScope = computed(() => `fields:${props.node.typeId || ''}`);
const viewFields = ref(loadFieldPreference(fieldsScope.value));
watch(fieldsScope, () => {
  viewFields.value = loadFieldPreference(fieldsScope.value);
});
const fieldOptions = computed(() => (props.node.listControls?.sortKeys || [])
  .map(key => ({ name: key.name, label: key.label })));
const seededFields = computed(() => viewFields.value
  ?? fieldOptions.value.map(field => field.name));
function fieldChecked(name) {
  return seededFields.value.includes(name);
}
function toggleField(name) {
  const next = new Set(seededFields.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  const all = fieldOptions.value.length;
  viewFields.value = next.size === all ? null : [...next];
  storeFieldPreference(fieldsScope.value, viewFields.value);
}
const collectionsNode = computed(() => {
  if (!viewFields.value || !props.node.listControls) return props.node;
  const keys = new Set(viewFields.value);
  return {
    ...props.node,
    listControls: {
      ...props.node.listControls,
      sortKeys: (props.node.listControls.sortKeys || []).filter(key => keys.has(key.name))
    }
  };
});

const filterToggleAvailable = computed(() => facetsToggleAvailable.value);
const conditionCount = computed(() => countPredicates(builderFilter.value));
const toggleViewSettings = event => viewPopover.value?.toggle(event);
// The setup popover is the collection's one view surface (SPEC §22.15):
// the display layout, filters, sort, and fields; the trigger badges the
// active condition count. The layout picker is the display type, so each
// choice renders its projection icon; picking one restores the per-type
// preferences.
const LAYOUT_LABEL_KEYS = {
  table: 'uiMapping.layoutTable',
  board: 'uiMapping.layoutBoard',
  'card-grid': 'uiMapping.layoutCards',
  timeline: 'uiMapping.layoutTimeline',
  stats: 'uiMapping.layoutStats',
  gantt: 'uiMapping.layoutGantt',
  calendar: 'uiMapping.layoutCalendar'
};
const LAYOUT_ICONS = {
  table: 'pi pi-table',
  board: 'pi pi-objects-column',
  'card-grid': 'pi pi-th-large',
  timeline: 'pi pi-chart-line',
  stats: 'pi pi-chart-bar',
  gantt: 'pi pi-align-left',
  calendar: 'pi pi-calendar'
};
const layoutOptions = computed(() => {
  const layouts = [derivedListLayout.value];
  if (projectionSwitchable.value) {
    const alternate = derivedListLayout.value === 'board' ? 'table' : 'board';
    if (!layouts.includes(alternate)) layouts.push(alternate);
  }
  return layouts.map(layout => ({
    id: `layout:${layout}`,
    layout,
    label: t(LAYOUT_LABEL_KEYS[layout] || 'uiMapping.view'),
    icon: LAYOUT_ICONS[layout] || 'pi pi-table',
    active: listLayout.value === layout
  }));
});
const viewSettingsAvailable = computed(() => layoutOptions.value.length > 1
  || filterToggleAvailable.value
  || sortToggleAvailable.value
  || fieldOptions.value.length > 0);
function selectLayoutOption(option) {
  projectionPreference.value = option.layout;
  storeProjectionPreference(projectionScope.value, option.layout);
}
const filteredInstances = computed(() => {
  if (props.node.surfaceKind !== 'list') return props.node.instances;
  const controls = props.node.listControls;
  if (!controls) return props.node.instances;
  const query = search.value.trim().toLowerCase();
  if (!query && !builderFilter.value) return props.node.instances;
  return props.node.instances.filter(instance =>
    instanceMatchesToolbar(props.node.type, controls, instance, query, {})
    && instanceMatchesFilter(instance, builderFilter.value, { pool: props.pool }));
});
</script>
