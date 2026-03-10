<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="pile" variant="inline" icon="pi pi-clone" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard class="card-interactive">
        <template #title>
          <div class="flex justify-between items-center gap-4">
            <div class="flex items-center gap-2">
              <i class="pi pi-clone"></i>
              <IdentityBlock :entity="pile" variant="compact" />
            </div>
            <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
          </div>
        </template>
        <template #subtitle>
          <div class="flex items-center gap-2">
            <Tag v-if="pile.specs?.thickness" :value="`${pile.specs.thickness}mm`" severity="secondary" size="small" />
            <small v-if="pile.stock">{{ remaining }} / {{ pile.stock.total }} remaining</small>
          </div>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else>
      <StandardCard class="card-interactive">
        <template #title>
          <div class="flex justify-between items-start gap-4">
            <IdentityBlock :entity="pile" />
            <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
          </div>
        </template>
        <template #subtitle>
          <div class="flex items-center gap-2">
            <Tag v-if="pile.specs?.thickness" :value="`${pile.specs.thickness}mm`" severity="secondary" size="small" />
            <small v-if="pile.stock">{{ remaining }} / {{ pile.stock.total }} remaining</small>
          </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';

const props = defineProps({
    pile: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});

const remaining = computed(() => (props.pile.stock?.total || 0) - (props.pile.stock?.used || 0));
</script>