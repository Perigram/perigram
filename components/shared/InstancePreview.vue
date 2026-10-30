<template>
  <RemoteInstancePreview
    v-if="mode !== 'none' && pluginPreview"
    :record="entity"
    :type-id="typeId"
    :preview="pluginPreview"
  >
    <InstancePreviewMedia :entity="entity" :type-id="typeId" :hide-dimension-layer="hideDimensionLayer" :fill="fill" :interactive="interactive" />
  </RemoteInstancePreview>
  <InstancePreviewMedia
    v-else-if="mode !== 'none'"
    :entity="entity"
    :type-id="typeId"
    :hide-dimension-layer="hideDimensionLayer"
    :fill="fill"
    :interactive="interactive"
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
  hideDimensionLayer: { type: Boolean, default: false },
  // Host-owned band opt-in: the generic media fills the fixed-height band
  // with no chrome of its own.
  fill: { type: Boolean, default: false },
  // `false` inside a trigger surface: the preview yields its clicks to
  // the trigger's own open.
  interactive: { type: Boolean, default: true }
});

const pluginPreview = computed(() => resolvePluginPreview(props.typeId));
</script>
