<template>
    <div class="p-4 bg-[var(--p-content-background)] border rounded-xl flex items-center gap-4 group hover:border-primary transition-colors">
        <div 
            class="w-12 h-12 rounded-lg border-2 border-[var(--p-content-border-color)] shadow flex-shrink-0"
            :style="{ backgroundColor: pile.colorFallback || '#ccc' }"
        >
            <img v-if="pile.colorThumbnail" :src="pile.colorThumbnail" class="w-full h-full object-cover rounded-lg" />
        </div>
        <div class="flex flex-col flex-1 overflow-hidden">
            <span class="text-sm font-bold truncate">{{ pile.material }} - {{ pile.color }}</span>
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono opacity-60">ID: {{ pile.partyId }}</span>
                <Tag :value="`${pile.thickness}mm`" severity="secondary" class="text-[8px]" />
            </div>
        </div>
        <div class="flex flex-col items-end">
             <span class="text-xs font-black">{{ pile.totalCount - pile.usedCount }} / {{ pile.totalCount }}</span>
             <span class="text-[8px] font-bold opacity-40 uppercase">Remaining</span>
        </div>
    </div>
</template>

<script setup>
import Tag from 'primevue/tag';
defineProps({
    pile: {
        type: Object,
        required: true
    }
});
</script>
