<template>
  <div v-if="responsiveContext === 'container'" class="responsive-grid-container">
    <div :class="containerGridClass">
      <slot />
    </div>
  </div>
  <div v-else :class="gridClass">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  variant: { type: String, default: 'cards' },
  responsiveContext: { type: String, default: 'viewport' }
});

const gridClass = computed(() => {
  if (props.variant === 'dense') {
    return 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
  }
  if (props.variant === 'wide') {
    return 'grid grid-cols-1 items-start gap-[var(--ck-grid-gap)] lg:grid-cols-2';
  }
  return 'grid grid-cols-1 items-start gap-[var(--ck-grid-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6';
});
const containerGridClass = computed(() => [
  'responsive-grid grid grid-cols-1 items-start',
  props.variant === 'dense' ? 'responsive-grid--dense gap-4' : 'gap-[var(--ck-grid-gap)]',
  {
    'responsive-grid--wide': props.variant === 'wide',
    'responsive-grid--cards': props.variant !== 'wide' && props.variant !== 'dense'
  }
]);
</script>

<style scoped>
.responsive-grid-container {
  container-type: inline-size;
}

@container (min-width: 24rem) {
  .responsive-grid--cards,
  .responsive-grid--dense {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (min-width: 32rem) {
  .responsive-grid--wide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .responsive-grid--cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@container (min-width: 48rem) {
  .responsive-grid--cards,
  .responsive-grid--dense {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
