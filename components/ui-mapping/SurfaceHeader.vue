<template>
  <!-- The unified page header (SPEC §22.3): one anatomy for instance
       pages, editor pages, and custom pages — breadcrumbs where lineage
       exists, the title (in-place editable where the surface owns the
       name), the clickable type label, the state surface, and the
       action cluster. It paints nothing: the page's stack rhythm
       separates it from the body, and pane boxes / route shells own the
       frames around it. -->
  <div :class="[spacing ? spacing.stackTight : LAYOUT.stackTight, 'surface-header', LAYOUT.header]">
    <TraceChain v-if="instance && !compact" :entity="instance" :type-id="type?.id || ''" />
    <div :class="LAYOUT.headerRow">
      <!-- Contextual navigation slot: a host that opened this record
           inside another surface (a workspace tab reached from another
           page, a routed detail screen) injects its back affordance
           here, ahead of the identity block. The `navigation` prop is
           the same affordance as data for hosts that mount the screen
           as a component. -->
      <BackControl
        v-if="navigation"
        :back="navigation"
        class="self-start"
      />
      <slot name="navigation" />
      <div :class="[LAYOUT.row, LAYOUT.headerIdentity]">
        <Avatar v-if="type" :icon="glyph" shape="circle" :size="compact ? undefined : 'large'" class="shrink-0" />
        <div class="flex min-w-0 flex-1 flex-col">
          <div :class="LAYOUT.row" class="min-w-0">
            <!-- The title edits in place where the surface owns the name:
                 an editor's chrome channel, a host rename channel, else
                 the resolved title renders as text. -->
            <InputText
              v-if="renameChannel"
              v-model="nameValue"
              :class="[compact ? 'text-label' : (TYPE_BY_LEVEL[props.level] || 'text-section-heading'), 'min-w-0 w-full']"
              :pt="nameFieldPt"
              :placeholder="t('common.unnamed')"
              :aria-label="t('common.rename')"
              @keydown.enter.prevent.stop="commitName"
              @blur="commitName"
            />
            <span v-else :class="[compact ? 'text-label' : (TYPE_BY_LEVEL[props.level] || 'text-section-heading'), LAYOUT.nameClamp]">{{ identity }}</span>
            <!-- One state surface per header: the segmented current-state
                 tag is the trigger for the state popover — legal
                 transitions on top, the status_events audit trail below.
                 Instances without a state render nothing; no state is
                 itself information (SPEC §7: nothing synthesizes one). -->
            <StateTag
              v-if="currentState"
              :value="currentState"
              :policy="statePolicy"
              actionable
              class="shrink-0"
              @select="event => statePopover?.toggle(event)"
            />
            <Popover v-if="currentState" ref="statePopover" @hide="authoringLane = false">
              <div :class="['flex flex-col gap-3', authoringLane ? 'w-[26rem]' : 'w-80']">
                <div v-if="transitionActions.length" :class="LAYOUT.row">
                  <ActionButton
                    v-for="action in transitionActions"
                    :key="action.id || action.state?.to"
                    :action="action"
                    :state-policy="statePolicy"
                    @run="$emit('transition', { to: action.state.to, intent: action.intent || null, region: action.region || null })"
                  />
                </div>
                <StateHistory :instance="instance" :type-id="type.id" :target-id="instance.id" compact />
                <template v-if="authoringReady">
                  <Divider />
                  <DeclarationStatePanel v-if="authoringLane" :authoring="authoring" />
                  <Button
                    v-else
                    icon="pi pi-pencil"
                    :label="$t('typeDeclaration.editStates')"
                    size="small"
                    text
                    severity="secondary"
                    class="self-start"
                    @click="authoringLane = true"
                  />
                </template>
              </div>
            </Popover>
            <!-- The authoring twin of the state surface (SPEC §1): a
                 stateless record of a type with an authored declaration
                 carries the quiet add-states affordance where the tag would
                 sit; capability holders only. -->
            <template v-else-if="authoringReady">
              <Button
                icon="pi pi-plus"
                :label="$t('typeDeclaration.addStates')"
                size="small"
                text
                severity="secondary"
                class="shrink-0"
                data-testid="state-add-entry"
                @click="event => addStatesPopover?.toggle(event)"
              />
              <Popover ref="addStatesPopover">
                <div class="flex w-[26rem] max-w-[86vw] flex-col gap-3">
                  <DeclarationStatePanel :authoring="authoring" />
                </div>
              </Popover>
            </template>
          </div>
          <!-- The quiet type label opens the type's card (SPEC §22.8):
               glyph, authored name, the field vocabulary, the machine
               mini-view, and the authoring entries for holders. -->
          <Button
            v-if="!compact && type"
            ref="typeLabelButton"
            :label="typeLabel"
            text
            size="small"
            severity="secondary"
            class="w-fit justify-start truncate p-0 text-supporting"
            :aria-label="typeLabel"
            @click="event => typeCard?.toggle(event)"
          />
          <Popover ref="typeCard">
            <TypeCardPopup
              :type="type"
              :state-policy="statePolicy"
              :state-transitions="stateTransitions"
              @author-fields="openFieldsAuthoring"
              @author-states="openStatesAuthoring"
            />
          </Popover>
        </div>
      </div>
      <div :class="LAYOUT.row" class="header-actions">
        <!-- The editor chrome cluster (SPEC §4): the bound editor's
             divergence refresh and dirty-marked save render ahead of the
             host entries; an editor that binds nothing renders
             neither. -->
        <template v-if="chromeApi">
          <Button
            v-if="chromeApi.diverged"
            icon="pi pi-refresh"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('common.refresh')"
            :title="$t('common.refresh')"
            @click="chromeApi.reload?.()"
          />
          <Button
            v-if="chromeApi.save"
            :label="$t('common.save')"
            icon="pi pi-save"
            size="small"
            text
            severity="secondary"
            :loading="chromeApi.saving"
            :disabled="!chromeApi.dirty"
            @click="chromeApi.save()"
          />
        </template>
        <!-- Host-authored cluster entries (the record overlay's save
             affordance, SPEC §26; the custom page's save) render ahead of
             the record's action groups. -->
        <slot name="cluster" />
        <!-- The cluster groups by control kind — the comments entry,
             record utilities (the construct re-derive), generated
             actions, machine transitions — one tight group per kind with
             hairline dividers between non-empty groups. -->
        <span
          v-if="(chromeApi?.save || $slots.cluster) && (hasActionGroups)"
          :class="LAYOUT.actionDivider"
        />
        <div :class="LAYOUT.actionGroup">
          <Button
            v-if="recordIdentity"
            icon="pi pi-comments"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('uiMapping.comments')"
            :title="$t('uiMapping.comments')"
            @click="openComments"
          />
          <ActionButton
            v-for="action in rerunActions"
            :key="action.id"
            :action="action"
            :state-policy="statePolicy"
            @run="$emit('run', action)"
          />
        </div>
        <span
          v-if="inlineActions.length || overflowActions.length"
          :class="LAYOUT.actionDivider"
        />
        <div v-if="inlineActions.length" :class="LAYOUT.actionGroup">
          <ActionButton
            v-for="action in inlineActions"
            :key="action.id"
            :action="action"
            :state-policy="statePolicy"
            @run="$emit('run', action)"
          />
        </div>
        <span
          v-if="inlineActions.length && overflowActions.length"
          :class="LAYOUT.actionDivider"
        />
        <Button
          v-if="overflowActions.length"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          :aria-label="$t('uiMapping.moreActions')"
          @click="event => overflowMenu?.toggle(event)"
        />
        <Menu ref="overflowMenu" :model="overflowMenuItems" popup />
        <span
          v-if="expandable && (inlineActions.length || overflowActions.length)"
          :class="LAYOUT.actionDivider"
        />
        <div v-if="expandable" :class="LAYOUT.actionGroup">
          <Button
            icon="pi pi-external-link"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('common.expand')"
            :title="$t('common.expand')"
            @click="emit('expand')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import {
  LAYOUT, TYPE_BY_LEVEL, HEADER_ACTIONS_INLINE, titleFor, iconFor,
  resolveActionButton, actionLabelKey, localizedLabel
} from '#shared/ui-mapping/index.js';
import { actionAppliesToEntity } from '~/utils/action-visibility.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import ActionButton from './ActionButton.vue';
import TraceChain from '../shared/links/TraceChain.vue';
import BackControl from '../shared/BackControl.vue';
import StateTag from './StateTag.vue';
import StateHistory from '../shared/state/StateHistory.vue';
import TypeCardPopup from './TypeCardPopup.vue';
import DeclarationStatePanel from '../type-designer/DeclarationStatePanel.vue';

const spacing = inject('uiMappingSpacing', null);
// The record surface's declaration authoring session (SPEC §1): provided
// by DeclarationAuthoring at the record page; null everywhere else keeps
// the header byte-identical for non-holders.
const authoring = inject('declarationAuthoring', null);
const authoringReady = computed(() => Boolean(authoring?.ready?.value));
const authoringLane = ref(false);
const addStatesPopover = ref(null);
// The page host's comments panel channel (SPEC §22.17): page hosts
// provide `{ open(target) }`; bounded hosts (the popup, the peek) keep
// the shared chat surface.
const commentsPanel = inject('recordCommentsPanel', null);
const { te, t } = useI18n();

const props = defineProps({
  // The record's type record and screen instance. Custom pages carry
  // neither: the title prop names them and no type label, state
  // surface, or comments entry renders.
  type: { type: Object, default: null },
  instance: { type: Object, default: null },
  // The display title for surfaces without an instance (custom pages).
  title: { type: String, default: '' },
  actions: { type: Array, default: () => [] },
  level: { type: Number, default: 0 },
  bundle: { type: Object, default: null },
  // The region's per-type state policy map (contract.statePolicy[typeId]).
  statePolicy: { type: Object, default: null },
  // The contract's authored machine edges for the type
  // (stateTransitionsByType) — the type card's machine mini-view.
  stateTransitions: { type: Array, default: null },
  // Host-injected contextual back affordance as data (the template
  // `#navigation` slot is the same channel for direct hosts):
  // `{ icon, label, command }`.
  navigation: { type: Object, default: null },
  // The editor page chrome channel (SPEC §4): a bound editor surface
  // owns the title edit, the save control, and the divergence refresh.
  chrome: { type: Object, default: null },
  // The host's rename channel for the title (the record document's
  // identifier patch, the custom page's rename).
  onRename: { type: Function, default: null },
  // The compact treatment: the identity line alone, with every action
  // control and the state surface, over the body (the peek presentation).
  compact: { type: Boolean, default: false },
  // Host-selected step-up affordance: the record opens as its own page
  // instead of the current bounded surface.
  expandable: { type: Boolean, default: false }
});

const emit = defineEmits(['run', 'transition', 'refresh', 'open-instance', 'expand']);
const chromeApi = computed(() => props.chrome?.api || null);
const identity = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const displayName = computed(() => chromeApi.value?.name
  || (props.instance ? identity.value : props.title));
const typeLabel = computed(() => (props.type ? generatedEntityLabel(props.type, { t, te }) : ''));

const glyph = computed(() => iconFor(props.type, props.instance));
// The title's in-place edit: the chrome channel's rename where an
// editor binds, else the host's rename channel. The draft commits on
// enter and blur; an external rename re-seeds it the moment the draft
// is empty.
const renameChannel = computed(() => chromeApi.value?.rename || props.onRename || null);
const nameDraft = ref(null);
const nameValue = computed({
  get: () => nameDraft.value ?? displayName.value,
  set: value => { nameDraft.value = value; }
});
const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };
function commitName() {
  if (nameDraft.value === null) return;
  const name = String(nameDraft.value).trim();
  nameDraft.value = null;
  if (!name || name === displayName.value) return;
  const channel = renameChannel.value;
  if (channel) Promise.resolve(channel(name)).catch(() => {});
}

const typeCard = ref(null);
const typeLabelButton = ref(null);
function openStatesAuthoring() {
  typeCard.value?.hide();
  authoringLane.value = true;
  const anchor = typeLabelButton.value?.$el;
  const popover = currentState.value ? statePopover.value : addStatesPopover.value;
  popover?.show?.({}, anchor);
}
// The fields jump has no programmatic open on the property rows' popovers:
// the declaration designer page is the canonical authoring home.
function openFieldsAuthoring() {
  typeCard.value?.hide();
  openWorkspacePageFromChrome({ pageId: 'organizationProcess' });
}

const instanceId = computed(() => {
  const id = props.instance?._id ?? props.instance?.id;
  return id ? String(id) : '';
});
const recordIdentity = computed(() => Boolean(props.type?.id && instanceId.value));
function openComments() {
  const target = { typeId: String(props.type?.id), instanceId: instanceId.value, name: displayName.value };
  // The peek and every host without a panel channel (the record popup)
  // open the shared chat surface — one comments entry on every record
  // surface.
  if (!commentsPanel || props.compact) {
    openInstanceChat(target);
    return;
  }
  commentsPanel(target);
}
// Action placement budget: at most HEADER_ACTIONS_INLINE generated
// buttons render beside the title; the rest join one popup overflow menu
// (an ellipsis that reserves no layout space for its items) with the
// same localized labels and resolved icons ActionButton renders.
// Runtime state transitions never join the overflow menu: they render as
// dedicated transition buttons after the inline budget (they dispatch
// through the transition channel, which the generic run menu items do
// not carry). A compiled action whose state target the machine already
// serves is the same hop through the run channel — the machine button
// owns the state popover (its dispatch targets the opened instance), so
// the compiled twin never doubles it.
// Status transitions render only through the machine-scoped runtime set
// (their target depends on the opened instance's current state).
// updateInstance never joins the generic run menu: stateless ones are
// field edits (fields edit inline), state-carrying ones are the machine
// buttons.
const transitionActions = computed(() => props.actions
  .filter(action => action?.__runtime && action?.state?.to));
// The construct re-derive is a revision utility: it re-runs the record's
// construction over the stored inputs and mints its next revision; the
// version surface itself rides the payload preview.
const rerunActions = computed(() => props.actions.filter(action => action?.__rerun));
const manualActions = computed(() => props.actions
  .filter(action => action?.trigger?.mode !== 'event' && !action?.__runtime && !action?.__rerun)
  .filter(action => action?.actionKind !== 'updateInstance')
  // Inline-resolved actions (relation unlink) render on the reference
  // they address — the mapping contract's placement decision.
  .filter(action => resolveActionButton(action, { render: props.type?.render }).inline !== true)
  .filter(action => actionAppliesToEntity(action, props.instance, props.type?.id)));
const inlineActions = computed(() => manualActions.value.slice(0, HEADER_ACTIONS_INLINE));
const overflowActions = computed(() => manualActions.value
  .filter(action => !inlineActions.value.includes(action)));
const hasActionGroups = computed(() => Boolean(inlineActions.value.length || overflowActions.length || rerunActions.value.length || recordIdentity.value));
const statePopover = ref(null);
const overflowMenu = ref(null);
const overflowMenuItems = computed(() => overflowActions.value.map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action)
  };
}));
// The flat instance state (SPEC §7): one string, rendered by the
// segmented tag against the compiled per-type policy.
const currentState = computed(() => props.instance?.state || null);
</script>
