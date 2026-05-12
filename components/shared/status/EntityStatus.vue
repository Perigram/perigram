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
import { useI18n } from 'vue-i18n';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import { useStatus } from '~/composables/useBlocks';
import { useStatusController } from '~/composables/useStatusController';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true }, // e.g. 'project', 'queue'
  variant: { type: String, default: 'inline' }, // inline, full
  showActions: { type: Boolean, default: true },
  actions: { type: Array, default: () => [] }, // preferred action API
  manualActions: { type: Array, default: () => [] }, // backward compatibility
  expanded: { type: Boolean, default: null } // auto-expands when actions are provided
});

const emit = defineEmits(['transitioned']);
const { t } = useI18n();
const { state, timestamp, metadata } = useStatus(toRef(props, 'entity'));
const { transition, isTransitioning } = useStatusController();
const op = ref();

const toggle = (event) => {
    if (!isExpanded.value && (hasActions.value || timestamp.value || metadata.value?.note)) {
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

const customActions = computed(() => {
    if (Array.isArray(props.actions) && props.actions.length > 0) return props.actions;
    if (Array.isArray(props.manualActions) && props.manualActions.length > 0) return props.manualActions;
    return [];
});

// TODO: In a real implementation, we would fetch available transitions for current state from backend
const defaultTransitions = computed(() => {
    // Basic defaults if nothing else is provided
    if (state.value === 'DRAFT') return [{ label: t('status.ready'), to: 'READY', severity: 'success', icon: 'pi pi-check' }];
    return [];
});

const effectiveActions = computed(() => {
    if (!props.showActions) return [];
    return customActions.value.length > 0 ? customActions.value : defaultTransitions.value;
});

const hasCustomActions = computed(() => customActions.value.length > 0);
const hasActions = computed(() => effectiveActions.value.length > 0);
const isExpanded = computed(() => {
    if (typeof props.expanded === 'boolean') return props.expanded;
    return props.variant === 'full' || hasCustomActions.value;
});

const runAction = async (action) => {
    if (!action) return;

    if (typeof action.command === 'function') {
        await action.command();
        emit('transitioned', action.to || action.label || null);
        if (!isExpanded.value) op.value?.hide?.();
        return;
    }

    if (action.to) {
        await handleTransition(action.to);
    }
};
</script>

<template>
  <div v-if="props.entity" class="entity-status min-w-0">
    <template v-if="!isExpanded">
      <StatusBadge :state="state" class="cursor-pointer" @click="toggle" />

      <Popover ref="op">
          <div class="flex flex-col gap-4 min-w-48 max-w-80">
              <div v-if="hasActions" class="flex flex-col gap-2">
                  <small>{{ $t('common.actions.title') }}</small>
                  <div class="flex flex-col gap-1">
                      <Button
                          v-for="action in effectiveActions"
                          :key="action.to || action.label"
                          :label="action.label"
                          :icon="action.icon"
                          :severity="action.severity || 'secondary'"
                          :disabled="isTransitioning"
                          size="small"
                          text
                          class="justify-start"
                          @click="runAction(action)"
                      />
                  </div>
              </div>

              <Divider v-if="hasActions && (timestamp || metadata?.note)" />

              <div v-if="timestamp || metadata?.note" class="flex flex-col gap-3">
                  <div v-if="timestamp" class="flex flex-col">
                      <small>{{ $t('common.lastUpdated') }}</small>
                      <span>{{ timestamp.toLocaleString() }}</span>
                  </div>
                  <div v-if="metadata?.note" class="flex flex-col">
                      <small>{{ $t('common.note') }}</small>
                      <span class="italic">"{{ metadata.note }}"</span>
                  </div>
              </div>

              <slot name="extra"></slot>
          </div>
      </Popover>
    </template>

    <template v-else>
        <div class="flex flex-col gap-2 min-w-0">
            <div class="flex items-center gap-2 min-w-0">
                <StatusBadge :state="state" />
                <div v-if="timestamp" class="flex items-center gap-2 text-xs text-muted-color min-w-0">
                    <span class="truncate">{{ timestamp.toLocaleDateString() }}</span>
                    <span class="truncate">{{ timestamp.toLocaleTimeString() }}</span>
                </div>
            </div>

            <div v-if="metadata?.note" class="text-xs italic text-muted-color truncate" :title="metadata.note">
                "{{ metadata.note }}"
            </div>

            <div v-if="hasActions" class="flex flex-wrap gap-2">
                <Button
                    v-for="action in effectiveActions"
                    :key="action.to || action.label"
                    :label="action.label"
                    :icon="action.icon"
                    :severity="action.severity || 'secondary'"
                    :disabled="isTransitioning"
                    size="small"
                    @click="runAction(action)"
                />
            </div>

            <slot name="extra"></slot>
        </div>
    </template>
  </div>
</template>
