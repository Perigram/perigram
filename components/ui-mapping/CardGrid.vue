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
            <PreviewBox :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
          </template>
          <template #title>
            <div :class="LAYOUT.rowBetween">
              <div :class="LAYOUT.row">
                <i :class="iconFor(type, instance)" class="text-muted" />
                <Button
                  v-if="openable"
                  link
                  :label="identityOf(instance)"
                  :class="LAYOUT.linkClamp"
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
          <!-- SPEC §22.8: a homogeneous collection never repeats the
               type name per card — the collection's own header names it.
               Only containment context (ParentRef) earns the line. -->
          <template v-if="parented" #subtitle>
            <span class="inline-flex min-w-0 items-center gap-1.5">
              <ParentRef
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
                  :quantitative="quantitative"
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
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import {
  LAYOUT, SCALAR_BASES, cardFactCount, titleFor, iconFor, isIdentifierField,
  fieldLabel, fieldLabelKey, localizedLabel, resolveListControls,
  resolveActionButton, actionLabelKey, stateDisplayFor
, typeIsQuantitative } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';
import ParentRef from './ParentRef.vue';
import { actionAppliesToEntity } from '~/utils/action-visibility.js';
const spacing = inject('uiMappingSpacing', null);

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // SPEC §22.8: the type's quantitative dominance earns the dashboard
  // field presentations.
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct grid usage).
  controls: { type: Object, default: null },
  // Per-instance quick actions for the type (resolveInstanceActions):
  // status transitions, deletion, instance-scoped commands. Rendered as
  // one ellipsis menu per card; empty set renders no control.
  actions: { type: Array, default: () => [] },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  // The containment cross-cut composes on this collection (unscoped class
  // list): cards carry the parent context token beside the type label.
  parented: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map from the compiled process contract: the
  // card status badge renders exactly when the vocabulary exists.
  statePolicy: { type: Object, default: null }
});

const quantitative = computed(() => typeIsQuantitative(props.type));

const emit = defineEmits(['open', 'run']);

const { te, t } = useI18n();

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
const pagination = computed(() => resolvedControls.value.pagination);

const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });
const statusOf = instance => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
};
// Card facts exclude the identifier field — the card title IS the
// identifier value (titleFor); a fact row would repeat it. A narrow
// host takes the compact fact budget (the container seam).
const hostContainer = useHostContainerTraits();
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([name, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .filter(([name]) => !isIdentifierField(props.type, name))
  .slice(0, cardFactCount(props.type, { compact: hostContainer.value.width === 'narrow' }))
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
// Action applicability resolves through the canonical seam
// (`actionAppliesToEntity`: type/parent match, authored state.from equality,
// no-op suppression).
const cardMenuItems = computed(() => props.actions
  .filter(action => actionAppliesToEntity(action, menuInstance.value, props.type?.id))
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
