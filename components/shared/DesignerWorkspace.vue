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
         column. -->
    <div v-if="layout === 'lanes'" class="designer-workspace__lanes relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <main class="designer-workspace__canvas absolute inset-0 min-h-0 min-w-0 overflow-hidden">
        <slot />
        <div v-if="$slots.dock" class="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <slot name="dock" />
        </div>
      </main>
      <aside
        v-if="$slots.palette"
        class="designer-workspace__rail designer-workspace__palette absolute inset-y-3 left-3 z-20 min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="palette" />
      </aside>
      <aside
        v-if="$slots.inspector"
        class="designer-workspace__rail designer-workspace__inspector absolute inset-y-3 right-3 z-20 min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
      >
        <slot name="inspector" />
      </aside>
      <aside
        v-if="$slots.support"
        class="designer-workspace__rail designer-workspace__support absolute bottom-3 left-3 z-20 min-h-0 overflow-hidden rounded-ui border border-content-border bg-content shadow-overlay"
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
.designer-workspace {
  container-type: inline-size;
}

.designer-workspace__rail {
  display: flex;
  flex-direction: column;
}

.designer-workspace__palette {
  width: 17rem;
  max-width: 42%;
}

.designer-workspace__inspector {
  width: 19rem;
  max-width: 48%;
}

.designer-workspace__support {
  left: 20rem;
  width: 17rem;
  max-width: 42%;
  max-height: 45%;
}

@container (max-width: 48rem) {
  .designer-workspace__support {
    left: 3rem;
  }
}
</style>
