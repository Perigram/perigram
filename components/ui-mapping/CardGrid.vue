<template>
  <DataView
    :value="instances"
    data-key="id"
    layout="grid"
    :paginator="instances.length > pagination.paginateAt"
    :rows="pagination.rows"
  >
    <template #grid="slotProps">
      <ResponsiveGrid variant="dense" responsive-context="container">
        <Card v-for="instance in slotProps.items" :key="instance.id" :class="[LAYOUT.clip, 'w-full']">
          <template #header>
            <PreviewBox :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" :seed="instance.id" />
          </template>
          <template #title>
            <div :class="LAYOUT.rowBetween">
              <div :class="LAYOUT.row">
                <i :class="iconFor(type, instance)" class="text-muted" />
                <Button
                  v-if="openable"
                  link
                  :label="identityOf(instance)"
                  class="text-left [&_.p-button-label]:truncate"
                  @click="$emit('open', instance)"
                />
                <span v-else class="truncate">{{ identityOf(instance) }}</span>
              </div>
              <div :class="LAYOUT.row">
                <Tag
                  v-if="statusOf(instance)"
                  :value="statusOf(instance).label"
                  :severity="statusOf(instance).severity"
                />
                <Button
                  v-if="actions.length"
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  severity="secondary"
                  :aria-label="$t('uiMapping.moreActions')"
                  @click="event => openCardMenu(event, instance)"
                />
              </div>
            </div>
          </template>
          <template #subtitle>
            <span class="inline-flex min-w-0 items-center gap-1.5">
              <span class="truncate">{{ type?.name }}</span>
              <ParentRef
                v-if="parented"
                :instance="instance"
                :bundle="bundle"
                :pool="pool"
                class="min-w-0"
              />
            </span>
          </template>
          <template #content>
            <div :class="spacing ? spacing.stackTight : 'flex flex-col gap-3'">
              <div v-for="field in scalarFields" :key="field.name" :class="LAYOUT.rowBetween">
                <span class="text-supporting text-muted">{{ field.label }}</span>
                <FieldControl
                  :model-value="instance.fields?.[field.name]"
                  :descriptor="field.descriptor"
                  variant="inline"
                  :pool="pool"
                  :bundle="bundle"
                />
              </div>
            </div>
          </template>
        </Card>
      </ResponsiveGrid>
    </template>
    <template #empty>
      <Message severity="info">{{ $t('uiMapping.emptyRegion') }}</Message>
    </template>
  </DataView>
  <Menu ref="cardMenu" :model="cardMenuItems" popup />
</template>

<script setup>
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Menu from 'primevue/menu';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import {
  LAYOUT, SCALAR_BASES, cardFactCount, titleFor, iconFor,
  fieldLabel, fieldLabelKey, localizedLabel, resolveListControls,
  resolveActionButton, actionLabelKey, stateDisplayFor
} from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';
import ParentRef from './ParentRef.vue';
import { incomingChildrenEdges } from '#shared/ui-mapping/index.js';

const spacing = inject('uiMappingSpacing', null);

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct grid usage).
  controls: { type: Object, default: null },
  // Per-instance quick actions for the type (resolveInstanceActions):
  // status transitions, deletion, instance-scoped commands. Rendered as
  // one ellipsis menu per card; empty set renders no control.
  actions: { type: Array, default: () => [] },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map from the compiled process contract: the
  // card status badge renders exactly when the vocabulary exists.
  statePolicy: { type: Object, default: null }
});

const emit = defineEmits(['open', 'run']);

const { te, t } = useI18n();

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
const pagination = computed(() => resolvedControls.value.pagination);

// The containment cross-cut: cards of a child-capable type carry their
// parent beside the type name (see ParentRef) — containment stays visible
// wherever the row surfaces, nesting included elsewhere.
const parented = computed(() => incomingChildrenEdges(props.bundle, props.type?.id).length > 0);

const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });
const statusOf = instance => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
};
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, cardFactCount(props.type))
  .map(([name, descriptor]) => ({
    name,
    descriptor,
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, name), fieldLabel(name, descriptor))
  })));

// One shared popup menu: the ellipsis remembers the card it opened for,
// and menu commands re-emit through the region run contract with that
// instance as context (confirmation and dispatch stay upstream).
const cardMenu = ref(null);
const menuInstance = ref(null);
function openCardMenu(event, instance) {
  menuInstance.value = instance;
  cardMenu.value?.toggle(event);
}
// A state-scoped action applies only in the state it leaves; the flat
// instance state may be a nested path (parentState.state1), so the leaf
// segment matches the authored local name.
const stateMatches = (action = {}, instance = null) => {
  const from = action.state?.from || '';
  if (!from) return true;
  const state = typeof instance?.state === 'string' ? instance.state : '';
  if (!state) return false;
  return state === from || state.endsWith(`.${from}`);
};

const cardMenuItems = computed(() => props.actions
  .filter(action => stateMatches(action, menuInstance.value))
  .filter(action => !resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy }).hidden)
  .map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action, { instance: menuInstance.value })
  };
}));
</script>
