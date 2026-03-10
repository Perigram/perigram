<script setup>
/**
 * PileCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.pile);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="pile" variant="inline" icon="pi pi-database" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="pile" variant="compact" />
            <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <TraceChain :entity="pile" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="pile"  />
                <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
            </div>
        </template>
        
        <Divider />
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
                <small>Quantity</small>
                <span>{{ pile.data?.stock?.total || 0 }}</span>
            </div>
            <div v-if="pile.origin" class="flex justify-between items-center">
                <small>Stocked</small>
                <span>{{ new Date(pile.origin.timestamp).toLocaleDateString() }}</span>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('materials', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="$emit('edit', pile)" />
                <Button v-if="authStore.can('materials', 'read')" icon="pi pi-search" text rounded size="small" @click="$emit('view', pile)" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>
