<template>
  <Panel v-if="node.surfaceKind === 'list'" class="w-full">
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-section-heading">{{ node.type?.render?.label || node.id }}</span>
        <Tag :value="String(node.instances.length)" severity="secondary" />
      </div>
    </template>
    <template v-if="node.actions.length" #icons>
      <div class="flex flex-wrap items-center gap-2">
        <ActionButton
          v-for="action in node.actions"
          :key="action.id"
          :action="action"
          :render="node.type?.render"
          @run="emitRun"
        />
      </div>
    </template>
    <CollectionTable :instances="node.instances" :type="node.type" :pool="pool" :bundle="bundle" />
    <RegionBlock
      v-for="child in node.childRegions"
      :key="child.id"
      :node="child"
      :pool="pool"
      :bundle="bundle"
      :depth="depth + 1"
      @run="emitRun"
    />
  </Panel>

  <div v-else class="flex w-full flex-col gap-4">
    <span v-if="!node.instances.length" class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
    <SurfaceBody
      v-else
      :instance="node.instances[0]"
      :type="node.type"
      :variant="node.variant"
      :actions="node.actions"
      :pool="pool"
      :bundle="bundle"
    />
    <RegionBlock
      v-for="child in node.childRegions"
      :key="child.id"
      :node="child"
      :pool="pool"
      :bundle="bundle"
      :depth="depth + 1"
      @run="emitRun"
    />
  </div>
</template>

<script setup>
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import SurfaceBody from './SurfaceBody.vue';
import CollectionTable from './CollectionTable.vue';
import ActionButton from './ActionButton.vue';

defineProps({
  node: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  depth: { type: Number, default: 0 }
});

const emit = defineEmits(['run']);
const emitRun = action => emit('run', action);
</script>
