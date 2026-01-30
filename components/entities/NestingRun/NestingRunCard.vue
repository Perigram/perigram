<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import ArtifactCard from '../Artifact/ArtifactCard.vue';
import { useStatus } from '~/composables/useBlocks';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  active: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  artifacts: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'choose', 'delete', 'artifact-click', 'convert-to-physical', 'create-requisition']);

const authStore = useAuthStore();
const { state, timestamp, statusColor } = useStatus(props.run);

const formatDate = (d) => {
    const val = d || timestamp.value;
    if (!val) return 'Pending';
    try {
        const date = typeof val === 'string' ? new Date(val) : val;
        if (isNaN(date.getTime())) return 'Pending';
        return date.toLocaleString();
    } catch (e) {
        return 'Pending';
    }
};

const isVirtual = computed(() => props.run.materialMode === 'VIRTUAL');
const canManage = computed(() => authStore.can('queues', 'edit'));
const isComplete = computed(() => state.value === 'COMPLETE' || state.value === 'CHOSEN');
</script>

<template>
  <!-- COMPACT / INLINE VARIANT -->
  <template v-if="variant === 'inline' || variant === 'compact'">
    <div 
        class="flex items-center gap-3 p-2 border rounded-xl transition-all cursor-pointer"
        :class="[
            active ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]/10' : 'border-[var(--p-content-border-color)] hover:border-[var(--p-primary-200)]',
            isChosen ? 'ring-2 ring-[var(--p-primary-color)] ring-offset-2' : ''
        ]"
        @click="$emit('select', run._id)"
    >
        <span class="font-black text-sm">#{{ run.runNumber }}</span>
        <Tag :value="run.materialMode || 'WAREHOUSE'" :severity="isVirtual ? 'warn' : 'info'" class="text-[8px] py-0 px-1" />
        <EntityStatus :entity="run" variant="inline" />
        <div v-if="isComplete" class="flex items-center gap-3 ml-auto">
                <div class="flex flex-wrap gap-1">
                <ArtifactCard 
                    v-for="artifact in [...artifacts].sort((a,b) => (a.type === 'LAYOUT_DXF' ? -1 : 1))" 
                    :key="artifact._id" 
                    :artifact="artifact" 
                    variant="inline"
                    @click="$emit('artifact-click', artifact)"
                />
            </div>
            <div class="flex items-center gap-1.5 pl-3 border-l border-[var(--p-content-border-color)]">
                <span class="text-[10px] font-bold opacity-60">{{ run.layoutCount || 0 }} SHT</span>
                <span v-if="run.utilization" class="text-[10px] font-black text-[var(--p-primary-color)]">{{ (run.utilization * 100).toFixed(0) }}%</span>
            </div>
        </div>
        <Button v-if="canManage" icon="pi pi-trash" severity="danger" text size="small" class="h-6 w-6 p-0" @click.stop="$emit('delete', run._id)" />
    </div>
  </template>

  <!-- CARD VARIANT (Default) -->
  <div 
    v-else
    class="p-4 border-2 rounded-2xl transition-all cursor-pointer flex flex-col gap-3 relative h-52 group overflow-hidden"
    :class="[
        active 
            ? 'border-[var(--p-primary-color)] shadow-md bg-[var(--p-primary-50)]/10' 
            : (isChosen 
                ? 'border-[var(--p-primary-300)] bg-[var(--p-primary-50)]/30' 
                : 'border-[var(--p-content-border-color)] bg-[var(--p-content-background)] hover:border-[var(--p-primary-200)]')
    ]"
    @click="$emit('select', run._id)"
  >
    <div class="flex items-start justify-between">
        <div class="flex flex-col">
            <div class="flex items-center gap-2">
                <span class="text-xl font-black">#{{ run.runNumber }}</span>
                <Tag 
                    :value="run.materialMode === 'VIRTUAL' ? 'VIRTUAL' : 'WAREHOUSE'" 
                    :severity="isVirtual ? 'warn' : 'info'" 
                    class="text-[8px]" 
                />
            </div>
            <EntityStatus :entity="run" variant="inline" />
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
                v-if="canManage"
                icon="pi pi-trash" severity="danger" text rounded size="small"
                class="h-8 w-8"
                @click.stop="$emit('delete', run._id)"
            />
        </div>
    </div>

    <!-- Results / Progress -->
    <div v-if="isComplete" class="flex flex-col gap-2 flex-1">
        <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 text-xs font-bold text-[var(--p-text-muted-color)]">
                <i class="pi pi-clone"></i>
                <span>{{ run.layoutCount || 0 }} {{ $t('results.sheets') }}</span>
            </div>
            <div v-if="run.utilization" class="flex items-center gap-1.5 text-xs font-bold text-[var(--p-primary-color)]">
                <i class="pi pi-chart-bar"></i>
                <span>{{ (run.utilization * 100).toFixed(1) }}%</span>
            </div>
        </div>
        
            <div class="flex flex-wrap gap-1">
                <ArtifactCard 
                    v-for="artifact in [...artifacts].sort((a,b) => (a.type === 'LAYOUT_DXF' ? -1 : 1))" 
                    :key="artifact._id" 
                    :artifact="artifact" 
                    variant="inline"
                    @click="$emit('artifact-click', artifact)"
                />
            </div>
    </div>
    <div v-else-if="state === 'NESTING' || run.status === 'NESTING' || run.status?.state === 'NESTING'" class="flex-1 flex items-center justify-center">
        <i class="pi pi-spin pi-spinner opacity-20 text-2xl"></i>
    </div>
    <div v-else-if="state === 'ERROR' || run.status === 'ERROR' || run.status?.state === 'ERROR'" class="flex-1 text-[10px] text-red-500 italic line-clamp-2">
        {{ run.error || 'Nesting failed' }}
    </div>

    <!-- Smart Buttons / Actions -->
    <div v-if="canManage && isComplete" class="flex flex-wrap gap-2 mt-auto pt-2 border-t border-dashed border-[var(--p-content-border-color)]">
        <Button 
            v-if="isVirtual"
            :label="$t('nesting.findInWarehouse')" icon="pi pi-search-plus" 
            size="small" severity="info" text class="p-0 text-[9px] font-black uppercase"
            @click.stop="$emit('convert-to-physical', run._id)"
        />
        <Button 
            v-if="isVirtual"
            :label="$t('requisition.createRequisition')" icon="pi pi-shopping-cart" 
            size="small" severity="help" text class="p-0 text-[9px] font-black uppercase"
            @click.stop="$emit('create-requisition', run._id)"
        />
        <Button 
            v-if="!isChosen"
            :label="$t('queue.chooseRun')" icon="pi pi-check-circle"
            size="small" text class="p-0 font-black uppercase tracking-wider text-[9px] ml-auto"
            @click.stop="$emit('choose', run._id)"
        />
    </div>

    <div v-else class="flex items-center justify-between mt-auto pt-2 border-t border-[var(--p-content-border-color)]">
        <span class="text-[10px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-tight">
            {{ formatDate(run.origin?.timestamp || run.createdAt) }}
        </span>
    </div>
  </div>
</template>

<style scoped>
.group:hover .opacity-0 {
    opacity: 1;
}
</style>