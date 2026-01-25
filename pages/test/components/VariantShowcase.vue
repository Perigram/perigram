<template>
  <Panel class="variant-showcase-panel">
    <template #header>
      <div class="flex flex-col">
        <h3 class="text-xl font-black uppercase tracking-widest">{{ title }}</h3>
        <p class="text-xs opacity-50 font-bold uppercase tracking-[0.2em]">{{ subtitle }}</p>
      </div>
    </template>

    <div class="grid grid-cols-1 xl:grid-cols-12 gap-8 pt-4">
      <!-- Card Variant Column -->
      <div class="xl:col-span-5 flex flex-col gap-4">
        <div class="flex items-center gap-2 opacity-40">
          <Badge value="CARD" severity="primary" size="small" />
          <span class="text-[9px] font-black uppercase tracking-widest">Dashboard Variant</span>
        </div>
        <div class="flex-grow">
           <slot />
        </div>
      </div>

      <!-- Other Variants Column -->
      <div class="xl:col-span-7 flex flex-col gap-8">
        <!-- Compact Variant -->
        <div v-if="$slots.compact" class="flex flex-col gap-4">
          <div class="flex items-center gap-2 opacity-40">
            <Badge value="COMPACT" severity="secondary" size="small" />
            <span class="text-[9px] font-black uppercase tracking-widest">List Variant</span>
          </div>
          <slot name="compact" />
        </div>

        <!-- Inline Variant -->
        <div v-if="$slots.inline" class="flex flex-col gap-4">
          <div class="flex items-center gap-2 opacity-40">
            <Badge value="INLINE" severity="success" size="small" />
            <span class="text-[9px] font-black uppercase tracking-widest">Minimal Variant</span>
          </div>
          <div class="p-4 border-2 border-dashed rounded-2xl flex items-center justify-center opacity-80">
             <slot name="inline" />
          </div>
        </div>
      </div>
    </div>
  </Panel>
</template>

<script setup>
import Panel from 'primevue/panel';
import Badge from 'primevue/badge';

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
});
</script>

<style scoped>
:deep(.p-panel-content) {
  padding: 2rem !important;
}
</style>
