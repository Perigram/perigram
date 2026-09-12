<template>
    <Panel :header="$t('statistics.title')">
            <div v-if="statistics && statistics.sheetsUsed !== undefined" class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Panel>
                    <div class="flex flex-col gap-1">
                        <span class="text-section-heading">{{ statistics.sheetsUsed || 0 }}</span>
                        <small>{{ $t('results.sheets') }}</small>
                    </div>
                </Panel>
                <Panel>
                    <div class="flex flex-col gap-1">
                        <span class="text-section-heading">{{ (statistics.totalAreaUsed || 0).toFixed(2) }} m²</span>
                        <small>{{ $t('statistics.totalArea') }}</small>
                    </div>
                </Panel>
                <Panel>
                    <div class="flex flex-col gap-1">
                        <span class="text-section-heading">{{ (statistics.utilizationRate || 0).toFixed(2) }}%</span>
                        <small>{{ $t('statistics.efficiency') }}</small>
                    </div>
                </Panel>
            </div>
            <div v-else class="flex flex-col items-center py-8">
                <i class="pi pi-chart-line"></i>
                <p>{{ $t('results.noResults') }}</p>
            </div>
    </Panel>
</template>

<script setup>
import Panel from 'primevue/panel';
const props = defineProps({
    statistics: {
        type: Object,
        required: false,
    },
});
</script>
