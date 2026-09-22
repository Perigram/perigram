<template>
  <DataView :value="sortedInstances" data-key="id" layout="grid" :paginator="sortedInstances.length > 8" :rows="8">
    <template v-if="sortOptions.length" #header>
      <div :class="LAYOUT.rowBetween">
        <span class="text-label text-muted">{{ $t('uiMapping.sortLabel') }}</span>
        <div :class="LAYOUT.row">
          <AppSelect
            v-model="sortName"
            :options="sortOptions"
            option-label="label"
            option-value="value"
            show-clear
            :size="editorSize"
            class="max-w-56"
            :aria-label="$t('uiMapping.sortLabel')"
          />
          <Button
            v-if="sortName"
            :icon="sortOrder < 0 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down'"
            text
            rounded
            :size="editorSize === 'small' ? 'small' : undefined"
            :aria-label="$t('uiMapping.sortOrderLabel')"
            @click="sortOrder = -sortOrder"
          />
        </div>
      </div>
    </template>
    <template #grid="slotProps">
      <ResponsiveGrid variant="dense" responsive-context="container">
        <Card v-for="instance in slotProps.items" :key="instance.id" :class="[LAYOUT.clip, 'w-full']">
          <template #header>
            <PreviewBox :type="type" :payload="instance.payload" :seed="instance.id" />
          </template>
          <template #title>
            <div :class="LAYOUT.rowBetween">
              <div :class="LAYOUT.row">
                <i :class="type?.render?.icon || 'pi pi-circle'" class="text-muted" />
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
          <template #subtitle>{{ type?.render?.label }}</template>
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
  LAYOUT, SCALAR_BASES, cardFactCount, SEVERITY_MAP, instanceIdentity,
  fieldLabel, fieldLabelKey, localizedLabel, resolveListControls, sortControlRows,
  resolveActionButton, actionLabelKey
} from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-sort-preference.js';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';
import AppSelect from '~/components/shared/InstanceSelect.vue';

const spacing = inject('uiMappingSpacing', null);
const editorSize = computed(() => (spacing ? spacing.editorSize : undefined));

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
  bundle: { type: Object, default: null }
});

const emit = defineEmits(['open', 'run']);

const { te, t } = useI18n();

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
// Card ordering runs over the same sortKeys contract as the table (same
// semantics through the shared comparator); the initial selection is the
// persisted sort choice for this type, falling back to the declared
// default sort, and every change persists back.
const scope = computed(() => `card-grid:${props.type?.id || ''}`);
const preferred = loadSortPreference(scope.value);
const sortName = ref(preferred?.name || resolvedControls.value.defaultSort);
const sortOrder = ref(preferred?.order || 1);
watch([sortName, sortOrder], () => {
  if (sortName.value) storeSortPreference(scope.value, { name: sortName.value, order: sortOrder.value });
});
watch(() => resolvedControls.value.defaultSort, value => {
  if (!sortName.value) sortName.value = value;
});
const sortKey = computed(() => resolvedControls.value.sortKeys.find(key => key.name === sortName.value) || null);
const sortOptions = computed(() => resolvedControls.value.sortKeys.map(key => ({ label: key.label, value: key.name })));
const sortedInstances = computed(() => (sortKey.value
  ? sortControlRows(props.instances, sortKey.value, sortOrder.value)
  : props.instances));

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => instanceIdentity(props.type, instance);
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
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
const cardMenuItems = computed(() => props.actions.map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action, { instance: menuInstance.value })
  };
}));
</script>
