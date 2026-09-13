<template>
  <Dock
    :model="model"
    position="bottom"
    :class="['process-designer-dock', dockClass]"
    :aria-label="ariaLabel"
    :pt="dockPt"
  >
    <template #item="{ item }">
      <span v-if="item.separator" class="mx-auto block h-6 w-px bg-content-border" aria-hidden="true" />
      <ProcessDesignerDockItem
        v-else
        :item="item"
        :mouse-x="mouseX"
        :distance="distance"
        :base-item-size="baseItemSize"
        :magnification="magnification"
      />
    </template>
  </Dock>
</template>

<script setup>
  import { computed, ref } from 'vue';
  import Dock from 'primevue/dock';
  import ProcessDesignerDockItem from '~/components/process-designer/ProcessDesignerDockItem.vue';

  const props = defineProps({
    items: { type: Array, required: true },
    ariaLabel: { type: String, default: '' },
    dockClass: { type: String, default: '' },
    distance: { type: Number, default: 96 },
    baseItemSize: { type: Number, default: 40 },
    magnification: { type: Number, default: 56 }
  });

  const mouseX = ref(Infinity);
  const model = computed(() => props.items.map(item => (
    item.separator ? { separator: true, disabled: true } : { ...item, separator: false }
  )));
  const dockPt = computed(() => ({
    // PrimeVue ships no magnification CSS in v4; the generic item transition
    // only lags behind the GSAP-driven size tweens, so items opt out of it
    // and motion stays owned by composables/useMotion.js.
    item: { style: { transition: 'none' } },
    listContainer: {
      onMousemove: event => {
        mouseX.value = event.clientX;
      },
      onMouseleave: () => {
        mouseX.value = Infinity;
      }
    }
  }));
</script>
