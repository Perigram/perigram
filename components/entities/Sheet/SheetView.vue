<script setup>
/**
 * Sheet View Component - v24 Standardized
 * Model: identity, lineage, specs
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'compact' }
});

const { serial } = useIdentity(props.sheet);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-file opacity-50"></i>
        <span class="font-mono font-bold">{{ serial }}</span>
        <EntityStatus :entity="sheet" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="font-bold font-mono">{{ serial }}</span>
              <small class="opacity-50 uppercase font-black">
                PILE: {{ String(sheet.lineage?.pileId ?? "").slice(-8) }}
              </small>
            </div>
            <EntityStatus :entity="sheet" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="h-full">
        <template #title>
          <div class="flex justify-between items-center gap-4">
            <span class="font-black font-mono tracking-widest text-lg">{{ serial }}</span>
            <EntityStatus :entity="sheet" variant="inline" />
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4 mt-2 border-t border-surface border-dashed">
            <div class="flex justify-between items-center text-xs opacity-50 uppercase font-bold">
              <span>Dimensions</span>
              <span>{{ sheet.specs?.width }} x {{ sheet.specs?.length }} mm</span>
            </div>
            <div class="p-2 border border-surface border-dashed rounded text-[10px] opacity-50">
               RUN ID: {{ sheet.lineage?.runId }}
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
