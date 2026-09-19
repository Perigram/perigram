<template>
  <div :class="[spacing ? spacing.stackTight : 'flex flex-col gap-3', LAYOUT.headerBar]">
    <BreadcrumbTrail v-if="trail.length > 1" :instance="instance" :bundle="bundle" :pool="pool" />
    <div :class="LAYOUT.headerRow">
      <div :class="[LAYOUT.row, LAYOUT.headerIdentity]">
        <Avatar :icon="type?.render?.icon || 'pi pi-circle'" shape="circle" size="large" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span :class="[TYPE_BY_LEVEL[props.level] || 'text-section-heading', LAYOUT.nameClamp]">{{ identity }}</span>
          <span class="text-supporting text-muted truncate">{{ type?.render?.label }} · {{ instance.id }}</span>
        </div>
        <Tag v-if="status" :value="status.label" :severity="status.severity" />
      </div>
      <div :class="LAYOUT.row">
        <Button
          v-if="editable"
          :label="editing ? $t('uiMapping.save') : $t('uiMapping.edit')"
          :icon="editing ? 'pi pi-check' : 'pi pi-pencil'"
          size="small"
          :severity="editing ? undefined : 'secondary'"
          :text="!editing"
          @click="$emit('toggle-edit')"
        />
        <ActionButton
          v-for="action in inlineActions"
          :key="action.id"
          :action="action"
          :render="type?.render"
          @run="$emit('run', action)"
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
    <StateStrip
      v-if="type?.states?.main"
      :type="type"
      :instance="instance"
      :actions="actions"
      @run="$emit('run', $event)"
    />
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import {
  LAYOUT, TYPE_BY_LEVEL, SEVERITY_MAP, HEADER_ACTIONS_INLINE, instanceIdentity,
  resolveActionButton, actionLabelKey, localizedLabel
} from '#shared/ui-mapping/index.js';
import ActionButton from './ActionButton.vue';
import BreadcrumbTrail from './BreadcrumbTrail.vue';
import StateStrip from './StateStrip.vue';

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
  bundle: { type: Object, default: null }
});

const emit = defineEmits(['run', 'toggle-edit']);

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identity = computed(() => instanceIdentity(props.type, props.instance));
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
const inlineActions = computed(() => props.actions
  .filter(action => action?.trigger?.mode !== 'event')
  .slice(0, HEADER_ACTIONS_INLINE));
const overflowActions = computed(() => props.actions
  .filter(action => action?.trigger?.mode !== 'event')
  .filter(action => !inlineActions.value.includes(action)));
const overflowMenu = ref(null);
const overflowMenuItems = computed(() => overflowActions.value.map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action)
  };
}));
const status = computed(() => {
  const value = props.instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
});
</script>
