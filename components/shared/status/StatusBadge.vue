<template>
    <Tag 
        v-if="mapping"
        :value="t(mapping.label)" 
        :severity="mapping.severity" 
        :icon="mapping.icon"
        class="uppercase text-[10px] font-bold px-2 py-1"
    />
    <Tag 
        v-else 
        :value="status" 
        severity="secondary" 
        class="uppercase text-[10px] font-bold px-2 py-1"
    />
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import { STATUS_MAPPINGS } from '~/utils/status-engine';

const props = defineProps({
    status: {
        type: String,
        required: true
    }
});

const { t } = useI18n();

const mapping = computed(() => {
    // Check for exact match or lowercase match
    return STATUS_MAPPINGS[props.status] || STATUS_MAPPINGS[props.status.toLowerCase()];
});
</script>
