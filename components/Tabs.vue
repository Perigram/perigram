<template>
    <div>
        <div class="border-b border-gray-200 dark:border-gray-700">
            <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                <a v-for="tab in tabs" :key="tab.name" @click.prevent="activeTab = tab.name"
                    :class="[
                        tab.name === activeTab
                            ? 'border-indigo-500 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                        'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm cursor-pointer',
                    ]">
                    {{ tab.label || tab.name }}
                </a>
            </nav>
        </div>
        <div class="mt-4">
            <slot :name="activeTab" />
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
    tabs: {
        type: Array,
        required: true,
    },
    initialTab: {
        type: String,
        default: null,
    }
});

const activeTab = ref(props.initialTab || props.tabs[0]?.name);
</script>
