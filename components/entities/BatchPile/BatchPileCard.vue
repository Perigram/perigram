<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="pile" variant="inline" icon="pi pi-clone" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="pile" entity-type="material_pile" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
          <div class="flex justify-between items-start gap-3 min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <i class="pi pi-clone"></i>
              <IdentityBlock :entity="pile" variant="compact" />
            </div>
            <div class="shrink-0">
              <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
            </div>
          </div>
        </template>
        <template #subtitle>
          <div class="flex items-center gap-2">
            <Tag v-if="pile.specs?.thickness" :value="`${pile.specs.thickness}mm`" severity="secondary" size="small" />
            <small v-if="pile.stock">{{ remaining }} / {{ pile.stock.total }} remaining</small>
          </div>
        </template>
      </EntityCard>
    </template>

    <!-- Card -->
    <template v-else>
      <EntityCard :entity="pile" entity-type="material_pile" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
          <div class="flex justify-between items-start gap-3 min-w-0">
            <IdentityBlock :entity="pile" />
            <div class="shrink-0">
              <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
            </div>
          </div>
        </template>
        <template #subtitle>
          <div class="flex items-center gap-2">
            <Tag v-if="pile.specs?.thickness" :value="`${pile.specs.thickness}mm`" severity="secondary" size="small" />
            <small v-if="pile.stock">{{ remaining }} / {{ pile.stock.total }} remaining</small>
          </div>
        </template>
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';

const props = defineProps({
    pile: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});

const remaining = computed(() => (props.pile.stock?.total || 0) - (props.pile.stock?.used || 0));
</script>
