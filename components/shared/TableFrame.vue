<template>
  <div class="overflow-hidden rounded-panel border border-content-border bg-content [box-shadow:var(--ck-shadow-card)]">
    <slot />
  </div>
</template>

<style scoped>
:deep(.p-datatable-header-cell) {
  background: var(--p-surface-50);
}
</style>
