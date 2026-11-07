<template>
  <component
    :is="surface.workspacePage.component"
    v-if="surface.workspacePage"
    v-bind="mountProps"
    :mode="mode"
    :page-chrome="chrome"
  />
</template>

<script setup>
import { computed } from 'vue';
import { useInstancesStore } from '~/stores/instances';
import { editorMountMode } from '~/components/generated/file-surfaces.js';

// The editor mounted as a page surface (SPEC §4): the file-surface
// registry's workspace-page mount rendered flush under the unified
// header — the record document's editor band (the popup host) or the
// editor page (the open page surfaces). The opener's write grant keys
// the mode; editor mounts speak the wire record, so the store pool's
// DTO feeds the mount beside the detail body's screen instance. The
// chrome channel hands the editor's name/save/dirty state to the
// header.
const props = defineProps({
  surface: { type: Object, required: true },
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  chrome: { type: Object, default: null }
});

const instances = useInstancesStore();
const instanceId = computed(() => String(props.instance?._id || props.instance?.id || ''));
const wireRecord = computed(() => instances.dtoFor(instances.canonicalTypeKey(props.type?.id), instanceId.value)
  || props.instance);
const mode = computed(() => (instanceId.value ? editorMountMode(props.type?.id, wireRecord.value) : 'edit'));
const mountProps = computed(() => props.surface.workspacePage?.props?.({
  entity: wireRecord.value,
  instanceId: instanceId.value,
  typeId: props.type?.id
}, props.type?.id) || {});
</script>
