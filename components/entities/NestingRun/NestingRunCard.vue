<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import ArtifactCard from '../Artifact/ArtifactCard.vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import { useStatus } from '~/composables/useBlocks';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' }, // inline, compact, card
  active: { type: Boolean, default: false },
  isChosen: { type: Boolean, default: false },
  artifacts: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'choose', 'delete', 'artifact-click', 'convert-to-physical', 'create-requisition']);

const authStore = useAuthStore();
const { state } = useStatus(props.run);

const isVirtual = computed(() => props.run.materialMode === 'VIRTUAL');
const canManage = computed(() => authStore.can('queues', 'edit'));
const isComplete = computed(() => state.value === 'COMPLETE' || state.value === 'CHOSEN');
</script>

<template>
  <div class="h-full cursor-pointer" @click="$emit('select', run._id)">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="run" variant="inline" icon="pi pi-list-check" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span>#{{ run.runNumber }}</span>
                    <Tag :value="run.materialMode || 'WAREHOUSE'" :severity="isVirtual ? 'warn' : 'info'" />
                </div>
                <EntityStatus :entity="run" entity-type="nesting_run" variant="inline" />
            </div>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span>#{{ run.runNumber }}</span>
                <div class="flex gap-2">
                    <Tag :value="run.materialMode || 'WAREHOUSE'" :severity="isVirtual ? 'warn' : 'info'" />
                    <EntityStatus :entity="run" entity-type="nesting_run" variant="inline" />
                </div>
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-4">
            <!-- Results -->
            <div v-if="isComplete" class="flex flex-col gap-2">
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-1">
                        <i class="pi pi-clone"></i>
                        <span>{{ run.layoutCount || 0 }} Sheets</span>
                    </div>
                    <div v-if="run.utilization" class="flex items-center gap-1">
                        <i class="pi pi-chart-bar"></i>
                        <span>{{ (run.utilization * 100).toFixed(1) }}%</span>
                    </div>
                </div>
                
                <div class="flex flex-wrap gap-1">
                    <ArtifactCard 
                        v-for="artifact in [...artifacts].sort((a,b) => (a.type === 'LAYOUT_DXF' ? -1 : 1))" 
                        :key="artifact._id" 
                        :artifact="artifact" 
                        variant="compact"
                        @click="$emit('artifact-click', artifact)"
                    />
                </div>
            </div>

            <!-- State indicators -->
            <div v-else-if="state === 'NESTING'" class="flex justify-center p-2">
                <i class="pi pi-spin pi-spinner"></i>
            </div>
            <div v-else-if="state === 'ERROR'" class="italic">
                {{ run.error || 'Nesting failed' }}
            </div>
        </div>
        <template #footer>
            <template v-if="canManage">
                <Divider />
                <div class="flex flex-wrap justify-between items-center gap-2">
                    <div class="flex gap-2">
                        <Button 
                            v-if="isVirtual"
                            label="Find Warehouse" icon="pi pi-search-plus" 
                            text
                            @click.stop="$emit('convert-to-physical', run._id)"
                        />
                        <Button 
                            v-if="isVirtual"
                            label="Requisition" icon="pi pi-shopping-cart" 
                            text
                            @click.stop="$emit('create-requisition', run._id)"
                        />
                    </div>
                    <div class="flex gap-2">
                        <Button 
                            v-if="!isChosen"
                            label="Choose" icon="pi pi-check-circle"
                            @click.stop="$emit('choose', run._id)"
                        />
                        <Button 
                            icon="pi pi-trash" severity="danger" text
                            @click.stop="$emit('delete', run._id)"
                        />
                    </div>
                </div>
            </template>
        </template>
      </StandardCard>
    </template>
  </div>
</template>
