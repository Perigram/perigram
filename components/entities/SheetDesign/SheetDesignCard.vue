<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="design" variant="inline" icon="pi pi-map" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="design" entity-type="sheet_design" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
          <div class="flex items-start justify-between gap-3 min-w-0">
              <IdentityBlock :entity="design" variant="compact" />
              <div class="shrink-0">
                  <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
              </div>
          </div>
        </template>
      </EntityCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="design" entity-type="sheet_design" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-start gap-3 min-w-0">
                <IdentityBlock :entity="design" />
                <div class="shrink-0">
                    <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
                </div>
            </div>
        </template>
        <Divider />
        <SpecsBlock :entity="design" />
      </EntityCard>
    </template>
  </div>
</template>
