<template>
  <GeneratedScreenHost
    v-if="screen"
    :screen="screen"
    @open-instance="openInstance"
    @refresh="refresh"
  />
  <Message v-else severity="warn" :closable="false">{{ $t('common.notAvailable') }}</Message>
</template>

<script setup>
import { computed } from 'vue';
import Message from 'primevue/message';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';

const props = defineProps({
  typeId: { type: String, required: true }
});

const view = useFileTypeView();
const type = computed(() => view.typeById(props.typeId));

// The same minimal type-list screen the collection embed composes: one
// source and one region over the class type. Compiled process screens
// keep their own presentation; this is the class page's floor.
const screen = computed(() => (type.value ? {
  id: `class:${type.value.id}`,
  screenKey: `class:${type.value.id}`,
  template: 'typeList',
  typeId: type.value.id,
  sources: [{ id: type.value.id, typeId: type.value.id }],
  regions: [{ id: 'main', slot: 'main', sourceId: type.value.id }]
} : null));

function openInstance(instance) {
  if (!instance?.type || !instance?.id) return;
  openInstanceInWorkspace({ typeId: instance.type, instanceId: String(instance.id) });
}

function refresh() {
  view.refresh();
}
</script>
