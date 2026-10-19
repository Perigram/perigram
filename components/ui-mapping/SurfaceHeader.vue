<template>
  <!-- The record header paints nothing: no surface, no border — the
       record page's stack rhythm separates it from the body, and pane
       boxes / route shells own the frames around it. One identity line:
       contextual back, avatar, title with the one state surface (tag +
       history affordance) riding it, the localized type label muted
       below; actions cluster to the right (the identity's flex-1 is the
       push) and wraps below on narrow containers. -->
  <div :class="[spacing ? spacing.stackTight : 'flex flex-col gap-3', 'surface-header']">
    <BreadcrumbTrail :instance="instance" :bundle="bundle" :pool="pool" @open="target => emit('open-instance', target)" />
    <div :class="LAYOUT.headerRow" class="header-row">
      <!-- Contextual navigation slot: a host that opened this record
           inside another surface (a workspace tab reached from another
           page, a routed detail screen) injects its back affordance
           here, ahead of the identity block. The `navigation` prop is
           the same affordance as data for hosts that mount the screen
           as a component. -->
      <Button
        v-if="navigation"
        :icon="navigation.icon || 'pi pi-arrow-left'"
        :aria-label="navigation.label"
        :title="navigation.label"
        size="small"
        severity="secondary"
        text
        rounded
        class="shrink-0 self-start"
        @click="navigation.command"
      />
      <slot name="navigation" />
      <div :class="[LAYOUT.row, LAYOUT.headerIdentity]" class="header-identity">
        <Avatar :icon="glyph" shape="circle" size="large" class="shrink-0" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <div class="flex min-w-0 items-center gap-2">
            <span :class="[TYPE_BY_LEVEL[props.level] || 'text-section-heading', LAYOUT.nameClamp]">{{ identity }}</span>
            <!-- One state surface per header: an instance carrying a flat
                 state renders the segmented current-state tag with its
                 history popover (the status_events audit trail) riding
                 the title line; instances without a state render nothing
                 — no state is itself information (SPEC §7: nothing
                 synthesizes one). -->
            <StateTag v-if="currentState" :value="currentState" :policy="statePolicy" class="shrink-0" />
            <Button
              v-if="currentState"
              icon="pi pi-clock"
              text
              rounded
              size="small"
              severity="secondary"
              class="shrink-0"
              :aria-label="$t('uiMapping.stateHistory')"
              @click="event => historyPopover?.toggle(event)"
            />
            <Popover v-if="currentState" ref="historyPopover">
              <StateHistory :instance="instance" :type-id="type.id" :target-id="instance.id" compact />
            </Popover>
          </div>
          <span v-if="typeLabel" class="text-supporting text-muted truncate">{{ typeLabel }}</span>
        </div>
      </div>
      <div :class="LAYOUT.row" class="header-actions">
        <!-- The composed instance-chat entry, the same route every instance
             surface uses (InstanceCard footers, pane strips): the record
             header owns the conversation affordance. -->
        <InstanceChatEntry :type-id="type?.id" :instance="instance" :name="identity" />
        <component
          :is="editorAction"
          v-if="editorAction"
          :entity="instance"
          :type-id="type?.id"
          @refresh="$emit('refresh')"
        />
        <ActionButton
          v-for="action in inlineActions"
          :key="action.id"
          :action="action"
          :state-policy="statePolicy"
          @run="$emit('run', action)"
        />
        <!-- Available state-machine transitions render as header actions:
             the state axis is a tree, never a linear strip, so the machine
             surface IS its runnable edges. Runtime transitions dispatch
             through the dedicated transition channel. -->
        <ActionButton
          v-for="action in transitionActions"
          :key="action.id || action.state?.to"
          :action="action"
          :state-policy="statePolicy"
          @run="$emit('transition', { to: action.state.to, intent: action.intent || null, region: action.region || null })"
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import {
  LAYOUT, TYPE_BY_LEVEL, HEADER_ACTIONS_INLINE, titleFor, iconFor,
  resolveActionButton, actionLabelKey, localizedLabel
} from '#shared/ui-mapping/index.js';
import ActionButton from './ActionButton.vue';
import BreadcrumbTrail from './BreadcrumbTrail.vue';
import StateTag from './StateTag.vue';
import { useLocalizedTypeLabel } from './type-labels.js';
import InstanceChatEntry from '../shared/InstanceChatEntry.vue';
import StateHistory from '../shared/state/StateHistory.vue';

const spacing = inject('uiMappingSpacing', null);
const { te, t } = useI18n();

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  level: { type: Number, default: 0 },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // The region's per-type state policy map (contract.statePolicy[typeId]).
  statePolicy: { type: Object, default: null },
  // Host-injected contextual back affordance as data (the template
  // `#navigation` slot is the same channel for direct hosts):
  // `{ icon, label, command }`.
  navigation: { type: Object, default: null },
  // Editor action component for this record's type, resolved by the host
  // over the file-surface registry (null when the type has no editor).
  editorAction: { type: [Object, Function], default: null }
});

const emit = defineEmits(['run', 'transition', 'refresh', 'open-instance']);
const identity = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
// The subtitle names the class through the single label seam — instance
// ids are private display vocabulary and never render (SPEC §UI).
const { localizedTypeLabel } = useLocalizedTypeLabel();
const typeLabel = computed(() => localizedTypeLabel(props.type || {}));

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
// owns the header (its dispatch targets the opened instance), so the
// compiled twin never doubles it.
// Status transitions render only through the machine-scoped runtime set
// (their target depends on the opened instance's current state).
// updateInstance never joins the generic run menu: stateless ones are
// field edits (fields edit inline; editor-bound types open the editor),
// state-carrying ones are the machine buttons.
const transitionActions = computed(() => props.actions
  .filter(action => action?.__runtime && action?.state?.to));
const manualActions = computed(() => props.actions
  .filter(action => action?.trigger?.mode !== 'event' && !action?.__runtime)
  .filter(action => action?.actionKind !== 'updateInstance')
  .filter(action => {
    const from = action.state?.from || '';
    if (!from) return true;
    const state = typeof props.instance?.state === 'string' ? props.instance.state : '';
    return Boolean(state) && (state === from || state.endsWith(`.${from}`));
  }));
const inlineActions = computed(() => manualActions.value.slice(0, HEADER_ACTIONS_INLINE));
const overflowActions = computed(() => manualActions.value
  .filter(action => !inlineActions.value.includes(action)));
const historyPopover = ref(null);
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

<style scoped>
/* Container-relative record header (the ResponsiveGrid pattern — the
   tailwindcss build has no container-queries plugin, so this lives in
   real CSS, not Tailwind variants). The header is its own layout
   container; the identity's flex-1 pushes the action cluster right, so
   wide headers carry one identity line (back, avatar, title + state,
   type label, actions) while narrow headers — panels, detail side
   columns — stack the action cluster below the full-width identity. */
.surface-header {
  container-type: inline-size;
}

@container (min-width: 34rem) {
  .header-row {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .header-identity {
    min-width: 16rem;
  }
}
</style>
