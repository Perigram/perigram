<template>
  <RemoteInstancePreview
    v-if="mode !== 'none' && pluginPreview"
    :record="entity"
    :type-id="typeId"
    :preview="pluginPreview"
  >
    <InstancePreviewMedia :entity="entity" :type-id="typeId" :hide-dimension-layer="hideDimensionLayer" />
  </RemoteInstancePreview>
  <InstancePreviewMedia
    v-else-if="mode !== 'none'"
    :entity="entity"
    :type-id="typeId"
    :hide-dimension-layer="hideDimensionLayer"
  />
</template>

<script setup>
import { computed } from 'vue';
import RemoteInstancePreview from '~/components/generated/RemoteInstancePreview.vue';
import InstancePreviewMedia from '~/components/shared/InstancePreviewMedia.vue';
import { resolvePluginPreview } from '~/components/generated/plugin-preview-bindings.js';

// The unified preview slot resolver: a type with a served plugin preview
// binding mounts the plugin's preview module (read-only, over the record
// and its payload document); every other type — and any slot whose
// plugin module cannot load — renders the generic preview media.
const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  mode: { type: String, default: 'none' },
  hideDimensionLayer: { type: Boolean, default: false }
});

const pluginPreview = computed(() => resolvePluginPreview(props.typeId));
</script>
