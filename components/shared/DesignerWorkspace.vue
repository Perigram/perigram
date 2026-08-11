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

    <div v-if="layout === 'lanes'" class="designer-workspace__lanes grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
      <aside v-if="$slots.palette" class="designer-workspace__palette min-h-0 min-w-0 overflow-auto">
        <slot name="palette" />
      </aside>
      <main class="designer-workspace__canvas relative min-h-0 min-w-0 overflow-hidden">
        <slot />
        <div v-if="$slots.dock" class="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <slot name="dock" />
        </div>
      </main>
      <aside v-if="$slots.inspector" class="designer-workspace__inspector min-h-0 min-w-0 overflow-auto">
        <slot name="inspector" />
      </aside>
      <aside v-if="$slots.support" class="designer-workspace__support min-h-0 min-w-0 overflow-auto">
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
.designer-workspace__lanes {
  grid-template-areas:
    'canvas'
    'palette'
    'inspector'
    'support';
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(18rem, 1fr) auto auto auto;
}

.designer-workspace {
  container-type: inline-size;
}

.designer-workspace__palette { grid-area: palette; }
.designer-workspace__canvas { grid-area: canvas; }
.designer-workspace__inspector { grid-area: inspector; }
.designer-workspace__support { grid-area: support; }

@container (min-width: 80rem) {
  .designer-workspace__lanes {
    grid-template-areas: 'palette canvas inspector';
    grid-template-columns: minmax(16rem, 20rem) minmax(0, 1fr) minmax(18rem, 22rem);
    grid-template-rows: minmax(0, 1fr);
  }

  .designer-workspace__support {
    display: none;
  }
}
</style>
