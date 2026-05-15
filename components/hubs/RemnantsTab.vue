<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('remnants.title')" :subtitle="$t('remnants.subtitle')" />

    <ResponsiveGrid v-if="remnants.length">
        <RemnantCard 
            v-for="remnant in remnants" 
            :key="remnant._id" 
            :remnant="remnant" 
            variant="card"
            @click="viewDetails(remnant)"
        />
    </ResponsiveGrid>

    <StateBlock v-if="!loading && remnants.length === 0" :message="$t('remnants.noRemnants')" icon="pi pi-box" />
  </div>
</template>

<script setup>
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    remnants: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view']);
const viewDetails = (rem) => emit('view', rem);
</script>
