<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useAuthStore } from '~/stores/auth';
import { ref, computed } from 'vue';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['click', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.artifact);
const { state, statusColor } = useStatus(props.artifact);

const icon = computed(() => {
    if (props.artifact.type === 'LAYOUT_DXF' || props.artifact.type === 'DXF') return 'pi-box';
    if (props.artifact.type === 'PDF_PASSPORT' || props.artifact.type === 'PDF') return 'pi-file-pdf';
    if (props.artifact.type === 'REPORT') return 'pi-chart-bar';
    return 'pi-file';
});

const typeLabel = computed(() => {
    const map = { 'LAYOUT_DXF': 'DXF', 'PDF_PASSPORT': 'PDF', 'REPORT': 'REP' };
    return map[props.artifact.type] || props.artifact.type;
});
</script>

<template>
  <div :class="[`artifact-variant-${variant}`]" class="inline-block">
    <!-- INLINE: Smallest representation (e.g. for tight lists or badges) -->
    <template v-if="variant === 'inline'">
      <div 
        @click="$emit('click', artifact)" 
        class="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--p-content-border-color)] bg-[var(--p-content-background)] hover:border-[var(--p-primary-color)] transition-all cursor-pointer group"
        v-tooltip.top="name"
      >
        <i :class="['pi', icon]" class="text-[10px] opacity-50 group-hover:text-[var(--p-primary-color)]"></i>
        <span class="text-[10px] font-black uppercase tracking-tighter">{{ typeLabel }}</span>
        <div class="w-1 h-1 rounded-full" :class="`bg-${statusColor}-500`" v-if="state !== 'READY'"></div>
      </div>
    </template>

    <!-- COMPACT: Good for run cards, includes more info -->
    <template v-else-if="variant === 'compact'">
      <div 
        @click="$emit('click', artifact)" 
        class="flex items-center gap-2 p-2 border border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] hover:border-[var(--p-primary-color)] shadow-sm hover:shadow transition-all cursor-pointer group min-w-[120px]"
      >
        <div class="w-8 h-8 rounded-lg bg-[var(--p-content-border-color)]/30 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--p-primary-50)] transition-colors">
            <i :class="['pi', icon]" class="text-sm opacity-50 group-hover:text-[var(--p-primary-color)] group-hover:opacity-100"></i>
        </div>
        <div class="flex flex-col min-w-0">
            <span class="text-[9px] font-black uppercase tracking-widest opacity-40 leading-none mb-1">{{ typeLabel }}</span>
            <span class="text-[10px] font-bold truncate leading-none">{{ name }}</span>
        </div>
      </div>
    </template>

    <!-- CARD: Full featured card -->
    <template v-else-if="variant === 'card'">
      <Card @click="$emit('click', artifact)" class="cursor-pointer text-center hover:border-[var(--p-primary-color)] transition-all overflow-hidden border">
        <template #content>
            <div class="flex flex-col items-center py-4 gap-4">
                <div class="w-16 h-16 rounded-2xl bg-[var(--p-content-border-color)]/20 flex items-center justify-center">
                    <i :class="['pi', icon, 'text-3xl opacity-20']"></i>
                </div>
                <div class="flex flex-col gap-1 w-full px-2">
                    <div class="font-black text-xs truncate uppercase tracking-widest opacity-40">{{ typeLabel }}</div>
                    <div class="font-bold text-sm truncate w-full" :title="name">{{ name }}</div>
                </div>
                <Tag :value="state" :severity="statusColor" class="text-[8px] font-black px-2 py-0" />
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('artifacts', 'delete')" icon="pi pi-trash" text rounded severity="danger" size="small" @click="$emit('delete', artifact)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.artifact-variant-inline:hover, .artifact-variant-compact:hover {
    transform: translateY(-1px);
}
</style>