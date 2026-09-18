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
    <div class="flex flex-col gap-4">
      <div class="flex max-h-96 flex-col gap-2 overflow-y-auto">
        <span v-if="!node.instances.length" class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
        <SurfaceBody
          v-for="instance in node.instances"
          :key="instance.id"
          :instance="instance"
          :type="node.type"
          variant="row"
          parent-role="card"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
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
  </Panel>

  <div v-else class="flex w-full flex-col gap-4">
    <div v-if="node.actions.length" class="flex flex-wrap items-center gap-2">
      <ActionButton
        v-for="action in node.actions"
        :key="action.id"
        :action="action"
        :render="node.type?.render"
        @run="emitRun"
      />
    </div>
    <span v-if="!node.instances.length" class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
    <SurfaceBody
      v-else
      :instance="node.instances[0]"
      :type="node.type"
      :variant="node.variant"
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
