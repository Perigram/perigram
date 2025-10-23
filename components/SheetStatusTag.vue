<template>
    <span :class="['status-tag', `status-tag--${status}`]">
        {{ $t(`results.sheetStatus.${status}`) }}
    </span>
</template>

<script setup>
defineProps({
    status: {
        type: String,
        required: true,
        validator: (value) => ['pre', 'draft', 'ready', 'declined', 'cut'].includes(value)
    }
});
</script>

<style lang="scss" scoped>
.status-tag {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    
    &--pre {
        background: var(--fill-tertiary);
        color: var(--label-secondary);
    }
    
    &--draft {
        background: var(--fill-secondary);
        color: var(--label-secondary);
    }
    
    &--ready {
        background: #10b981;
        color: white;
    }
    
    &--declined {
        background: #ef4444;
        color: white;
    }
    
    &--cut {
        background: #8b5cf6;
        color: white;
    }
}
</style>
