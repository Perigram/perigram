<template>
    <div class="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">Project Statistics</h3>
        <div v-if="statistics" class="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Sheets Used</p>
                <p class="text-2xl font-bold">{{ statistics.sheetsUsed }}</p>
            </div>
            <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Total Area Used (sq. m)</p>
                <p class="text-2xl font-bold">{{ statistics.totalAreaUsed.toFixed(2) }}</p>
            </div>
            <div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Avg. Utilization</p>
                <p class="text-2xl font-bold">{{ statistics.utilizationRate.toFixed(2) }}%</p>
            </div>
        </div>
        <div v-else class="text-center text-gray-500 dark:text-gray-400 mt-4">
            No statistics available yet. Complete a nesting job to generate statistics.
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
