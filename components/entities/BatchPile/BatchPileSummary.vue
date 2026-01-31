<template>
    <div class="inline-flex items-center gap-3 p-2 border rounded">
        <i class="pi pi-clone"></i>
        <div class="flex flex-col">
            <small>Pile</small>
            <span>{{ data.partyId || data._id?.toString().slice(-6) }}</span>
        </div>
        <div class="flex gap-1">
            <Tag :value="`${data.thickness}mm`" severity="secondary" />
            <Tag :value="data.color" severity="secondary" />
        </div>
    </div>
</template>

<script setup>
defineProps({
    data: {
        type: Object,
        required: true
    }
});
</script>