<template>
  <div class="entity-workspace h-full min-h-0 min-w-0 flex-1">
    <div class="entity-workspace__grid grid h-full min-h-0 min-w-0 grid-cols-1 gap-4">
      <section
        v-if="$slots.lead"
        class="entity-workspace__lead min-h-0 min-w-0"
      >
        <slot name="lead" />
      </section>

      <main :class="mainClass">
        <slot />
      </main>

      <aside
        v-if="$slots.support"
        class="entity-workspace__support min-h-0 min-w-0"
      >
        <slot name="support" />
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  mainSpan: { type: Number, default: 8 },
});

const mainClass = computed(() => [
  'entity-workspace__main flex min-h-0 min-w-0 flex-col gap-4',
  { 'entity-workspace__main--full': props.mainSpan === 12 || !props.mainSpan },
]);
</script>

<style scoped>
.entity-workspace {
  container-type: inline-size;
}

@container (min-width: 64rem) {
  .entity-workspace__grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  .entity-workspace__main {
    grid-column: span 8 / span 8;
  }

  .entity-workspace__support {
    grid-column: span 4 / span 4;
  }

  .entity-workspace__lead,
  .entity-workspace__main--full {
    grid-column: span 12 / span 12;
  }
}
</style>
