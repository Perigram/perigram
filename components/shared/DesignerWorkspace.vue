<template>
  <section
    ref="workspace"
    v-bind="$attrs"
    :class="[
      'designer-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      $attrs.class
    ]"
    :data-designer-layout="layout"
  >
    <header v-if="$slots.toolbar" class="shrink-0">
      <slot name="toolbar" />
    </header>

    <!-- Lanes: the canvas is the workspace background, edge to edge; palette,
         inspector, and support are floating rails docked over it. The rails
         cap their own width against the workspace width, so narrow hosts
         keep the full-bleed canvas instead of collapsing into one stacked
         column. The row floor keeps the workspace usable even when a host
         forgets part of the bounded-height chain. -->
    <div v-if="layout === 'lanes'" class="designer-workspace__lanes min-h-0 min-w-0 flex-1 overflow-hidden">
      <main class="designer-workspace__canvas relative min-h-0 min-w-0 overflow-hidden">
        <slot />
        <div v-if="$slots.dock" class="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <slot name="dock" />
        </div>
      </main>
      <aside
        v-if="$slots.palette"
        class="designer-workspace__rail designer-workspace__palette min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="palette" />
      </aside>
      <aside
        v-if="$slots.inspector"
        class="designer-workspace__rail designer-workspace__inspector min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="inspector" />
      </aside>
      <aside
        v-if="$slots.support"
        class="designer-workspace__rail designer-workspace__support min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="support" />
      </aside>
    </div>

    <main v-else class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
      <div v-if="$slots.palette" class="absolute left-3 top-3 z-20 max-h-[calc(100%-6rem)] overflow-auto">
        <slot name="palette" />
      </div>
      <aside v-if="$slots.inspector" class="absolute bottom-16 right-3 top-3 z-20 min-h-0 max-w-[calc(100%-1.5rem)] overflow-auto">
        <slot name="inspector" />
      </aside>
      <div v-if="$slots.dock" class="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <slot name="dock" />
      </div>
    </main>
  </section>
</template>

<script setup>
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

defineProps({
  layout: {
    type: String,
    default: 'lanes',
    validator: value => ['lanes', 'canvas'].includes(value)
  }
});

const workspace = ref(null);
defineExpose({
  getBoundingClientRect: () => workspace.value?.getBoundingClientRect?.()
});
</script>

<style scoped>
/* One grid row: the canvas spans every column as the full-bleed background
   and the rails occupy the side tracks above it. The explicit row floor
   keeps the workspace visible even when a host breaks the bounded-height
   chain, and the rail max-widths cap against the workspace width instead
   of a viewport breakpoint. */
.designer-workspace__lanes {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: minmax(22rem, 1fr);
}

.designer-workspace__canvas {
  grid-area: 1 / 1 / 2 / 4;
}

.designer-workspace__rail {
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.designer-workspace__palette {
  grid-area: 1 / 1;
  width: 17rem;
  max-width: 42%;
  margin: 0.75rem 0 0.75rem 0.75rem;
}

.designer-workspace__inspector {
  grid-area: 1 / 3;
  width: 19rem;
  max-width: 48%;
  margin: 0.75rem 0.75rem 0.75rem 0;
}

.designer-workspace__support {
  grid-area: 1 / 2;
  align-self: end;
  justify-self: start;
  width: 17rem;
  max-width: 42%;
  max-height: 45%;
  margin: 0 0 0.75rem 0.75rem;
}
</style>
