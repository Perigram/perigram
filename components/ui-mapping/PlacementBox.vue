<template>
  <div ref="el" :class="LAYOUT.stack" class="min-w-0">
    <slot />
  </div>
</template>

<script setup>
// A placement box (SPEC → Placement-aware composition): the side rail or
// a peer-column track. It measures its own box and provides the container
// record everything inside renders against, so nested surfaces budget to
// the width they actually have.
import { ref } from 'vue';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import { providePlacementContainer } from '~/composables/useContainerTraits.js';

const el = ref(null);
providePlacementContainer(el);
</script>
