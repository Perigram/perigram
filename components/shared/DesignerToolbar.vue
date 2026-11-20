<template>
  <!-- The designer's floating canvas toolbar: panel toggles in the start
       group, canvas commands in the end group, bottom-centered over the
       canvas cell. The wrapper passes pointer events through its empty
       sides. -->
  <div
    data-designer-toolbar
    class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3"
  >
    <Toolbar
      :aria-label="$t('designer.toolbar')"
      class="pointer-events-auto max-w-full overflow-x-auto p-1 gap-1"
    >
      <template #start>
        <DesignerToolbarItems :items="startItems" />
      </template>
      <template v-if="endItems.length" #end>
        <DesignerToolbarItems :items="endItems" />
      </template>
    </Toolbar>
  </div>
</template>

<script setup>
import Toolbar from 'primevue/toolbar';
import DesignerToolbarItems from './DesignerToolbarItems.vue';

defineProps({
  startItems: { type: Array, default: () => [] },
  endItems: { type: Array, default: () => [] }
});
</script>
