<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('piles.title')" :subtitle="$t('piles.subtitle')">
      <template #actions>
        <Button v-if="authStore.can('materials', 'create')" :label="$t('common.create')" icon="pi pi-plus" @click="$emit('create')" />
      </template>
    </ActionToolbar>

    <ResponsiveGrid v-if="piles.length">
        <PileCard 
            v-for="pile in piles" 
            :key="pile._id" 
            :pile="pile" 
            variant="card"
            @view="viewDetails"
        />
    </ResponsiveGrid>
    
    <StateBlock v-if="!loading && piles.length === 0" :message="$t('piles.noPiles')" icon="pi pi-database" />
  </div>
</template>

<script setup>
/**
 * PilesTab - v24 Standardized
 */
import Button from 'primevue/button';
import PileCard from '~/components/entities/MaterialPile/PileCard.vue';
import { useAuthStore } from '~/stores/auth';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    piles: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'create']);
const authStore = useAuthStore();

const viewDetails = (pile) => emit('view', pile);
</script>
