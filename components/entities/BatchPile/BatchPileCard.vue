<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="pile" variant="inline" icon="pi pi-clone" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="pile" entity-type="material_pile" variant="compact" class="card-interactive" :show-trace="false">
        <template #before-identity>
          <i class="pi pi-clone"></i>
        </template>
        <template #subtitle>
          <div class="flex items-center gap-2">
            <Tag v-if="sheetThickness" :value="`${sheetThickness}mm`" severity="secondary" size="small" />
            <small v-if="stock">{{ remaining }} / {{ stock.total }}</small>
          </div>
        </template>
      </EntityCard>
    </template>

    <!-- Card -->
    <template v-else>
      <EntityCard :entity="pile" entity-type="material_pile" variant="card" class="card-interactive" :show-trace="false">
        <template #before-identity>
          <i class="pi pi-clone"></i>
        </template>
        <template #subtitle>
          <div class="flex items-center gap-2">
            <Tag v-if="sheetThickness" :value="`${sheetThickness}mm`" severity="secondary" size="small" />
            <small v-if="stock">{{ remaining }} / {{ stock.total }}</small>
          </div>
        </template>
        <Divider />
        <DataBlock :entity="pile" :fields="PILE_FIELDS" />
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
    pile: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});

const PILE_FIELDS = [
    { path: 'data.specs.sheetThickness', i18n: 'catalog.sheetThickness', suffix: ' mm' },
    { path: 'data.stock.total', i18n: 'piles.stockTotal' },
    { path: 'data.stock.used', i18n: 'piles.stockUsed' }
];

const stock = computed(() => props.pile.data?.stock || null);
const sheetThickness = computed(() => props.pile.data?.specs?.sheetThickness || null);
const remaining = computed(() => (stock.value?.total || 0) - (stock.value?.used || 0));
</script>
