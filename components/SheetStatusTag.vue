<template>
    <Tag 
        :value="$t(`results.sheetStatus.${status}`)" 
        :severity="severity"
        class="uppercase text-[10px] font-black"
    />
</template>

<script setup>
import Tag from 'primevue/tag'
import { computed } from 'vue'

const props = defineProps({
    status: {
        type: String,
        required: true,
        validator: (value) => ['pre', 'draft', 'ready', 'declined', 'cut'].includes(value)
    }
});

const severity = computed(() => {
    const map = {
        pre: 'secondary',
        draft: 'info',
        ready: 'success',
        declined: 'danger',
        cut: 'contrast'
    }
    return map[props.status] || 'info'
})
</script>

<style scoped>
</style>
