<template>
  <div :class="[spacing ? spacing.stackTight : 'flex flex-col gap-3', LAYOUT.headerBar, 'surface-header']">
    <BreadcrumbTrail v-if="trail.length > 1" :instance="instance" :bundle="bundle" :pool="pool" />
    <div :class="LAYOUT.headerRow" class="header-row">
      <!-- Contextual navigation slot: a host that opened this record
           inside another surface (a workspace tab reached from another
           page, a popup with a back stack) injects its back affordance
           here, ahead of the identity block. -->
      <slot name="navigation" />
      <div :class="LAYOUT.headerIdentity" class="header-identity">
        <Avatar :icon="glyph" shape="circle" size="large" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5 mt-2 ">
          <span :class="[TYPE_BY_LEVEL[props.level] || 'text-section-heading', LAYOUT.nameClamp]">{{ identity }}</span>
          <span class="text-supporting text-muted truncate">{{ type?.name }} · {{ instance.id }}</span>
        </div>
      </div>
      <div :class="LAYOUT.row">
        <Button
          v-if="editable"
          :icon="editing ? 'pi pi-check' : 'pi pi-pencil'"
          :aria-label="editing ? $t('uiMapping.save') : $t('uiMapping.edit')"
          :title="editing ? $t('uiMapping.save') : $t('uiMapping.edit')"
          size="small"
          :severity="editing ? undefined : 'secondary'"
          text
          rounded
          @click="$emit('toggle-edit')"
        />
        <ActionButton
          v-for="action in inlineActions"
          :key="action.id"
          :action="action"
          :render="type?.render"
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
          :render="type?.render"
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
    <!-- One status surface per header: an instance carrying a flat state
         renders the segmented current-state tag with its history popover
         (the status_events audit trail); instances without a state render
         nothing — no state is itself information (SPEC §7: nothing
         synthesizes one). -->
    <div v-if="currentState" :class="[LAYOUT.row, 'mt-1']">
      <StateTag :value="currentState" :policy="statePolicy" />
      <Button
        icon="pi pi-clock"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('uiMapping.stateHistory')"
        @click="event => historyPopover?.toggle(event)"
      />
      <Popover ref="historyPopover">
        <StateHistory :instance="instance" :type-id="type.id" :target-id="instance.id" compact />
      </Popover>
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
import StateHistory from '../shared/state/StateHistory.vue';

const spacing = inject('uiMappingSpacing', null);
const { te, t } = useI18n();

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] },
  level: { type: Number, default: 0 },
  editable: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // The region's per-type state policy map (contract.statePolicy[typeId]).
  statePolicy: { type: Object, default: null }
});

const emit = defineEmits(['run', 'transition', 'toggle-edit']);
const identity = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const glyph = computed(() => iconFor(props.type, props.instance));
const trail = computed(() => {
  const chain = [];
  let cursor = props.instance;
  const seen = new Set([cursor?.id]);
  while (cursor) {
    chain.unshift(cursor.id);
    const parentRef = Object.values(cursor.lineage || {})[0];
    const parent = parentRef ? props.pool[parentRef.type]?.[parentRef.id] : null;
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    cursor = parent;
  }
  return chain;
});
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
const transitionActions = computed(() => props.actions
  .filter(action => action?.__runtime && action?.state?.to));
// Status transitions render only through the machine-scoped runtime set
// (their target depends on the opened instance's current state); a
// contract status action never joins the generic run menu.
const manualActions = computed(() => props.actions
  .filter(action => action?.trigger?.mode !== 'event' && !action?.__runtime)
  .filter(action => !(action?.actionKind === 'updateInstance' && action?.state?.to))
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
   real CSS, not Tailwind variants). The header bar is its own layout
   container; wide headers lay identity and actions on one wrapping row
   with a readable 16rem title floor (long names still truncate through
   the min-w-0 chain), while narrow headers — panels, detail side
   columns — stack the action cluster below the full-width title. */
.surface-header {
  container-type: inline-size;
}

@container (min-width: 34rem) {
  .header-row {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  .header-identity {
    min-width: 16rem;
  }
}
</style>
