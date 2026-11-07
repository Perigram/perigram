<template>
  <!-- The record header paints nothing: no surface, no border — the
       record page's stack rhythm separates it from the body, and pane
       boxes / route shells own the frames around it. One identity line:
       contextual back, avatar, title with the one state surface (tag +
       history affordance) riding it; actions cluster to the right (the
       identity's flex-1 is the push) and wraps below on narrow
       containers (the LAYOUT header recipe, container-relative). -->
  <div :class="[spacing ? spacing.stackTight : LAYOUT.stackTight, 'surface-header', LAYOUT.header]">
    <TraceChain v-if="!compact" :entity="instance" :type-id="type?.id || ''" variant="compact" expandable />
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
        <Avatar :icon="glyph" shape="circle" :size="compact ? undefined : 'large'" class="shrink-0" />
        <div class="flex min-w-0 flex-1 flex-col">
          <div :class="LAYOUT.row" class="min-w-0">
            <span :class="[compact ? 'text-label' : (TYPE_BY_LEVEL[props.level] || 'text-section-heading'), LAYOUT.nameClamp]">{{ identity }}</span>
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
          <span v-if="!compact && typeLabel" class="truncate text-muted text-supporting">{{ typeLabel }}</span>
        </div>
      </div>
      <div :class="LAYOUT.row" class="header-actions">
        <!-- The cluster groups by control kind — record utilities (the
             construct re-derive), generated actions, machine transitions
             — one tight group per kind with hairline dividers between
             non-empty groups. The conversation affordance renders only on
             the compact header (the peek): the record page's comments
             section owns the thread (SPEC §22.17). -->
        <div :class="LAYOUT.actionGroup">
          <InstanceChatEntry v-if="compact" :type-id="type?.id" :instance="instance" :name="identity" />
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
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import {
  LAYOUT, TYPE_BY_LEVEL, HEADER_ACTIONS_INLINE, titleFor, iconFor,
  resolveActionButton, actionLabelKey, localizedLabel
} from '#shared/ui-mapping/index.js';
import { actionAppliesToEntity } from '~/utils/action-visibility.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import ActionButton from './ActionButton.vue';
import TraceChain from '../shared/links/TraceChain.vue';
import BackControl from '../shared/BackControl.vue';
import StateTag from './StateTag.vue';
import InstanceChatEntry from '../shared/InstanceChatEntry.vue';
import StateHistory from '../shared/state/StateHistory.vue';
import DeclarationStatePanel from '../type-designer/DeclarationStatePanel.vue';

const spacing = inject('uiMappingSpacing', null);
// The record surface's declaration authoring session (SPEC §1): provided
// by DeclarationAuthoring at the record page; null everywhere else keeps
// the header byte-identical for non-holders.
const authoring = inject('declarationAuthoring', null);
const authoringReady = computed(() => Boolean(authoring?.ready?.value));
const authoringLane = ref(false);
const addStatesPopover = ref(null);
const { te, t } = useI18n();

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  level: { type: Number, default: 0 },
  bundle: { type: Object, default: null },
  // The region's per-type state policy map (contract.statePolicy[typeId]).
  statePolicy: { type: Object, default: null },
  // Host-injected contextual back affordance as data (the template
  // `#navigation` slot is the same channel for direct hosts):
  // `{ icon, label, command }`.
  navigation: { type: Object, default: null },
  // The compact treatment: the identity line alone, with every action
  // control and the state surface, over the body (the peek presentation).
  compact: { type: Boolean, default: false },
  // Host-selected step-up affordance: the record opens as its own page
  // instead of the current bounded surface.
  expandable: { type: Boolean, default: false }
});

const emit = defineEmits(['run', 'transition', 'refresh', 'open-instance', 'expand']);
const identity = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const typeLabel = computed(() => (props.type ? generatedEntityLabel(props.type, { t, te }) : ''));

const glyph = computed(() => iconFor(props.type, props.instance));
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
