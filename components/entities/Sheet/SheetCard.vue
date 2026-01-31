<script setup>
/**
 * Sheet View Component - v24 Standardized
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial } = useIdentity(props.sheet);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-file"></i>
        <span>{{ serial }}</span>
        <EntityStatus :entity="sheet" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="sheet" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small class="truncate italic">
                PILE: {{ String(sheet.lineage?.pileId ?? "").slice(-8) }}
            </small>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="sheet" variant="inline" />
            </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-3 pt-4 border-t border-dashed">
                <div class="flex justify-between items-center">
                    <small>Size</small>
                    <span>{{ sheet.specs?.width }} x {{ sheet.specs?.length }}</span>
                </div>
                <div v-if="sheet.lineage?.runId" class="flex flex-col gap-1 mt-2 pt-2 border-t border-muted">
                    <small>Run ID</small>
                    <span class="italic truncate">{{ sheet.lineage.runId }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>