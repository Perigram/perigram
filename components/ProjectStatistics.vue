<template>
    <div class="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{{ $t('statistics.title') }}</h3>
        <div v-if="statistics && statistics.sheetsUsed !== undefined" class="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('results.sheets') }}</p>
                <p class="text-2xl font-bold">{{ statistics.sheetsUsed || 0 }}</p>
            </div>
            <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('statistics.totalArea') }}</p>
                <p class="text-2xl font-bold">{{ (statistics.totalAreaUsed || 0).toFixed(2) }}</p>
            </div>
            <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('statistics.efficiency') }}</p>
                <p class="text-2xl font-bold">{{ (statistics.utilizationRate || 0).toFixed(2) }}%</p>
            </div>
        </div>
        <div v-else class="text-center text-gray-500 dark:text-gray-400 mt-4">
            {{ $t('results.noResults') }}
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
