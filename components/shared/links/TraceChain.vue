<template>
    <div class="flex items-center flex-wrap gap-2 py-2">
        <template v-for="(item, index) in ancestry" :key="index">
            <TraceLink 
                :type="item.type" 
                :id="item.id" 
                :label="item.label"
                :slug="item.slug"
            />
            <i v-if="index < ancestry.length - 1" class="pi pi-angle-right text-[8px] opacity-30"></i>
        </template>
    </div>
</template>

<script setup>
import TraceLink from './TraceLink.vue';

const props = defineProps({
    /**
     * Array of { type, id, label?, slug? }
     */
    ancestry: {
        type: Array,
        required: true,
        default: () => []
    }
});
</script>
