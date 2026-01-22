<template>
    <div class="mt-8 p-6 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm">
        <h3 class="text-base font-bold uppercase tracking-widest text-[var(--p-text-muted-color)] mb-6">{{ $t('statistics.title') }}</h3>
        <div v-if="statistics && statistics.sheetsUsed !== undefined" class="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div class="flex flex-col gap-1 p-4 rounded-lg bg-[var(--p-content-background)] border border-[var(--p-content-border-color)]">
                <p class="text-xs font-black uppercase tracking-tighter text-[var(--p-text-muted-color)] m-0">{{ $t('results.sheets') }}</p>
                <p class="text-3xl font-black text-[var(--p-primary-color)] m-0">{{ statistics.sheetsUsed || 0 }}</p>
            </div>
            <div class="flex flex-col gap-1 p-4 rounded-lg bg-[var(--p-content-background)] border border-[var(--p-content-border-color)]">
                <p class="text-xs font-black uppercase tracking-tighter text-[var(--p-text-muted-color)] m-0">{{ $t('statistics.totalArea') }}</p>
                <p class="text-3xl font-black text-[var(--p-text-color)] m-0">{{ (statistics.totalAreaUsed || 0).toFixed(2) }}<small class="text-sm ml-1 opacity-50">m²</small></p>
            </div>
            <div class="flex flex-col gap-1 p-4 rounded-lg bg-[var(--p-primary-50)] border border-[var(--p-primary-100)]">
                <p class="text-xs font-black uppercase tracking-tighter text-[var(--p-primary-color)] m-0">{{ $t('statistics.efficiency') }}</p>
                <p class="text-3xl font-black text-[var(--p-primary-color)] m-0">{{ (statistics.utilizationRate || 0).toFixed(2) }}%</p>
            </div>
        </div>
        <div v-else class="text-center py-8 opacity-40 italic flex flex-col items-center gap-2">
            <i class="pi pi-chart-line text-3xl"></i>
            <span class="text-sm font-medium">{{ $t('results.noResults') }}</span>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    statistics: {
        type: Object,
        required: false,
    },
});
</script>
