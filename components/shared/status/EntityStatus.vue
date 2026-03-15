<script setup>
/**
 * EntityStatus - v24 Absolute Final
 * Mandatory component for managing entity states and transitions.
 * Integrates display (StatusBadge) and logic (useStatusController).
 */
import { ref, computed, toRef } from 'vue';
import Popover from 'primevue/popover';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import { useStatus } from '~/composables/useBlocks';
import { useAuthStore } from '~/stores/auth';
import { useStatusController } from '~/composables/useStatusController';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true }, // e.g. 'project', 'queue'
  variant: { type: String, default: 'inline' }, // inline, full
  showActions: { type: Boolean, default: true },
  manualActions: { type: Array, default: () => [] } // Fallback for manual transition buttons
});

const emit = defineEmits(['transitioned']);
const authStore = useAuthStore();
const { state, timestamp, metadata } = useStatus(toRef(props, 'entity'));
const { transition, isTransitioning } = useStatusController();
const op = ref();

const toggle = (event) => {
    if (props.showActions || timestamp.value) {
        op.value.toggle(event);
    }
};

// Available transitions (to be fetched or derived from a machine registry if available)
const handleTransition = async (targetState) => {
    try {
        const id = props.entity.identity?.slug || props.entity.slug || props.entity._id || props.entity.id;
        await transition(props.entityType, id, targetState);
        emit('transitioned', targetState);
        op.value.hide();
    } catch (e) {
        console.error('Transition failed', e);
    }
};

// TODO: In a real implementation, we would fetch available transitions for current state from backend
const mockTransitions = computed(() => {
    if (props.manualActions.length > 0) return props.manualActions;
    
    // Basic defaults if nothing else is provided
    if (state.value === 'DRAFT') return [{ label: 'Ready', to: 'READY', severity: 'success', icon: 'pi pi-check' }];
    return [];
});
</script>

<template>
  <div v-if="entity" class="entity-status inline-flex">
    <!-- Inline Badge -->
    <template v-if="variant === 'inline' || variant === 'compact'">
      <StatusBadge 
        :state="state" 
        class="cursor-pointer"
        @click="toggle"
      />
    </template>

    <!-- Full Details -->
    <template v-else-if="variant === 'full'">
        <div class="flex flex-col items-end text-right gap-1">
            <StatusBadge :state="state" @click="toggle" class="cursor-pointer" />
            <div v-if="timestamp" class="flex flex-col text-xs text-muted-color">
                <span>{{ timestamp.toLocaleDateString() }}</span>
                <span>{{ timestamp.toLocaleTimeString() }}</span>
            </div>
            <div v-if="metadata?.note" class="text-xs italic text-muted-color max-w-48 truncate">
                "{{ metadata.note }}"
            </div>
        </div>
    </template>

    <Popover ref="op">
        <div class="flex flex-col gap-4 min-w-48">
            <!-- Transition Actions -->
            <div v-if="showActions && mockTransitions.length > 0" class="flex flex-col gap-2">
                <small>{{ $t('common.actions.title') }}</small>
                <div class="flex flex-col gap-1">
                    <Button 
                        v-for="t in mockTransitions" 
                        :key="t.to"
                        :label="t.label"
                        :icon="t.icon"
                        :severity="t.severity || 'secondary'"
                        :disabled="isTransitioning"
                        size="small"
                        text
                        class="justify-start"
                        @click="handleTransition(t.to)"
                    />
                </div>
            </div>

            <Divider v-if="showActions && mockTransitions.length > 0 && (timestamp || metadata?.note)" />

            <!-- Last Snapshot Info -->
            <div v-if="timestamp || metadata?.note" class="flex flex-col gap-3">
                <div v-if="timestamp" class="flex flex-col">
                    <small>Last Updated</small>
                    <span>{{ timestamp.toLocaleString() }}</span>
                </div>
                <div v-if="metadata?.note" class="flex flex-col">
                    <small>Note</small>
                    <span class="font-serif italic">"{{ metadata.note }}"</span>
                </div>
            </div>

            <slot name="extra"></slot>
        </div>
    </Popover>
  </div>
</template>
