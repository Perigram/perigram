<template>
  <component
    :is="surface.workspacePage.component"
    v-if="surface.workspacePage"
    v-bind="mountProps"
    :mode="mode"
  />
</template>

<script setup>
import { computed } from 'vue';
import { useInstancesStore } from '~/stores/instances';
import { editorMountMode } from '~/components/generated/file-surfaces.js';

// The editor mounted as the record body (SPEC §4): the file-surface
// registry's workspace-page mount rendered under the standard record
// header, in every host the record surface renders. The opener's write
// grant keys the mode; editor mounts speak the wire record, so the
// store pool's DTO feeds the mount beside the detail body's screen
// instance.
const props = defineProps({
  surface: { type: Object, required: true },
  instance: { type: Object, required: true },
  type: { type: Object, required: true }
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
