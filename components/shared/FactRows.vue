<template>
  <div v-if="rows.length" class="fact-rows-container">
    <dl
      class="fact-rows m-0"
      :class="variant === 'compact' ? 'flex flex-wrap gap-x-4 gap-y-1 text-body' : 'fact-rows-default grid grid-cols-1 gap-3'"
    >
      <div
        v-for="row in rows"
        :key="row.label"
        :class="variant === 'compact'
          ? 'inline-flex min-w-0 items-baseline gap-1.5'
          : 'min-w-0 rounded-ui border border-content-border px-3 py-2'"
      >
        <dt class="min-w-0 text-muted text-supporting">
          {{ row.label }}
        </dt>
        <dd
          class="m-0 min-w-0 break-words"
          :class="[
            row.role === 'technical' ? 'text-technical tabular-nums' : 'text-body',
            variant === 'compact' ? '' : 'mt-1'
          ]"
        >
          <span v-if="row.swatch" class="mr-1.5 inline-block h-3 w-3 shrink-0 rounded-ui align-middle" :style="{ backgroundColor: row.swatch }" />
          {{ row.display }}
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup>
// The one read-only fact-row renderer over pre-resolved rows
// (`instanceFactRows` in utils/fact-rows.js owns the derivation).
// Row contract: components/shared/README.md → FactRows.
defineProps({
  rows: { type: Array, default: () => [] },
  variant: { type: String, default: 'default' }
});
</script>
<style scoped>
.fact-rows-container {
  container-type: inline-size;
}

@container (min-width: 32rem) {
  .fact-rows-default {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
