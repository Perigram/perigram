<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('sheets.title')" :subtitle="$t('sheets.subtitle')" />

    <ResponsiveGrid v-if="sheets.length">
        <SheetCard 
            v-for="sheet in sheets" 
            :key="sheet._id" 
            :sheet="sheet" 
            variant="card"
            @click="viewDetails(sheet)"
        />
    </ResponsiveGrid>

    <StateBlock v-if="!loading && sheets.length === 0" :message="$t('sheets.noSheets')" icon="pi pi-file" />
  </div>
</template>

<script setup>
import SheetCard from '~/components/entities/Sheet/SheetCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    sheets: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view']);
const viewDetails = (sh) => emit('view', sh);
</script>
