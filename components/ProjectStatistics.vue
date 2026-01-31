<template>
    <Card>
        <template #title>{{ $t('statistics.title') }}</template>
        <template #content>
            <div v-if="statistics && statistics.sheetsUsed !== undefined" class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card>
                    <template #title>{{ statistics.sheetsUsed || 0 }}</template>
                    <template #subtitle>{{ $t('results.sheets') }}</template>
                </Card>
                <Card>
                    <template #title>{{ (statistics.totalAreaUsed || 0).toFixed(2) }} m²</template>
                    <template #subtitle>{{ $t('statistics.totalArea') }}</template>
                </Card>
                <Card>
                    <template #title>{{ (statistics.utilizationRate || 0).toFixed(2) }}%</template>
                    <template #subtitle>{{ $t('statistics.efficiency') }}</template>
                </Card>
            </div>
            <div v-else class="flex flex-col items-center py-8">
                <i class="pi pi-chart-line text-3xl"></i>
                <p>{{ $t('results.noResults') }}</p>
            </div>
        </template>
    </Card>
</template>

<script setup>
import Card from 'primevue/card';
const props = defineProps({
    statistics: {
        type: Object,
        required: false,
    },
});
</script>