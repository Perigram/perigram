<script setup>
/**
 * EntityStatus - v24 Absolute Final
 * Mandatory component for managing entity states and transitions.
 * Integrates display (StatusBadge) and logic (useStatusController).
 */
import { ref, computed, inject, toRef, unref, watch } from 'vue';
import Popover from 'primevue/popover';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import StatusLocation from '~/components/shared/status/StatusLocation.vue';
import { useStatus } from '~/composables/useBlocks';
import { useStatusController } from '~/composables/useStatusController';
import { createStatusAction, getWorkflowStatusActions, hasWorkflow } from '~/utils/status-actions.js';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true }, // e.g. 'project', 'queue'
  variant: { type: String, default: 'inline' }, // inline, full
  showActions: { type: Boolean, default: true },
  actions: { type: Array, default: () => [] }, // preferred action API
  manualActions: { type: Array, default: () => [] }, // backward compatibility
  expanded: { type: Boolean, default: null }, // auto-expands only for full status surfaces
  maxInlineActions: { type: Number, default: null },
  showHistory: { type: Boolean, default: true },
  workflows: { type: Object, default: null }
});

const emit = defineEmits(['transitioned']);
const { t } = useI18n();
const { state } = useStatus(toRef(props, 'entity'));
const { transition, fetchActions, isTransitioning } = useStatusController();
const op = ref();
const serverActions = ref([]);
const providedWorkflows = inject('statusWorkflows', null);
const localTransitionHandler = inject('statusTransitionHandler', null);

const toggle = (event) => {
    op.value?.toggle(event);
};

const entityId = computed(() => props.entity?._id || props.entity?.identity?.uid || props.entity?.identity?.slug);
const localWorkflows = computed(() => props.workflows || unref(providedWorkflows) || null);
const hasRegisteredWorkflow = computed(() => hasWorkflow(props.entityType, localWorkflows.value || undefined));
const useServerActions = computed(() => props.showActions && !localWorkflows.value && hasRegisteredWorkflow.value);
const useLocalTransition = computed(() => Boolean(localWorkflows.value && localTransitionHandler));

// Available transitions (to be fetched or derived from a machine registry if available)
const handleTransition = async (targetState) => {
    try {
        const result = useLocalTransition.value
            ? await localTransitionHandler({
                entityType: props.entityType,
                targetId: entityId.value,
                targetState,
                entity: props.entity
            })
            : await transition(props.entityType, entityId.value, targetState);
        emit('transitioned', targetState, result);
        await refreshServerActions();
        op.value?.hide?.();
    } catch (e) {
        console.error('Transition failed', e);
    }
};

const refreshServerActions = async () => {
    if (!useServerActions.value || !entityId.value) {
        serverActions.value = [];
        return;
    }

    try {
        serverActions.value = await fetchActions(props.entityType, entityId.value);
    } catch {
        serverActions.value = [];
    }
};

watch(
    [() => props.entityType, entityId, state, useServerActions],
    () => refreshServerActions(),
    { immediate: true }
);

const customActions = computed(() => {
    if (Array.isArray(props.actions) && props.actions.length > 0) return props.actions;
    if (Array.isArray(props.manualActions) && props.manualActions.length > 0) return props.manualActions;
    return [];
});

const defaultTransitions = computed(() => {
    if (useServerActions.value) {
        return serverActions.value.map(action => createStatusAction(action, undefined, t));
    }

    return getWorkflowStatusActions({
        entityType: props.entityType,
        state: state.value,
        workflows: localWorkflows.value || undefined,
        t
    });
});

const effectiveActions = computed(() => {
    if (!props.showActions) return [];
    const customKeys = new Set(customActions.value.map(action => action.to || action.label));
    return [
        ...customActions.value,
        ...defaultTransitions.value.filter(action => !customKeys.has(action.to || action.label))
    ]
      .filter(action => action?.display !== false && action?.display !== 'hidden');
});

const hasActions = computed(() => effectiveActions.value.length > 0);
const inlineActionLimit = computed(() => {
    if (typeof props.maxInlineActions === 'number') return props.maxInlineActions;
    return isExpanded.value ? 2 : 0;
});
const inlineActions = computed(() => effectiveActions.value
    .filter(action => (action.display || 'inline') === 'inline')
    .slice(0, inlineActionLimit.value));
const overflowActions = computed(() => [
    ...effectiveActions.value.filter(action => (action.display || 'inline') === 'menu'),
    ...effectiveActions.value.filter(action => (action.display || 'inline') === 'inline').slice(inlineActionLimit.value)
]);
const hasLocation = computed(() => Boolean(props.entity?.status?.lifecycle?.data?.location));
const hasOverflowContent = computed(() => overflowActions.value.length > 0 || hasLocation.value || props.showHistory);
const isExpanded = computed(() => {
    if (typeof props.expanded === 'boolean') return props.expanded;
    return props.variant === 'full';
});

const runAction = async (action) => {
    if (!action) return;

    if (typeof action.command === 'function') {
        await action.command();
        emit('transitioned', action.to || action.label || null);
        op.value?.hide?.();
        return;
    }

    if (action.to) {
        await handleTransition(action.to);
    }
};
</script>

<template>
  <div
    v-if="props.entity"
    class="entity-status inline-flex min-w-0 max-w-full justify-end"
    data-entity-card-interactive="true"
    @click.stop
  >
    <template v-if="!isExpanded">
      <div class="flex min-w-0 max-w-48 flex-wrap items-center justify-end gap-1.5 sm:max-w-56">
        <StatusBadge :state="state" class="cursor-pointer min-w-0 max-w-full shrink" @click.stop="toggle" />
        <Button
          v-for="action in inlineActions"
          :key="action.to || action.label"
          :label="action.label"
          :icon="action.icon"
          :severity="action.severity || 'secondary'"
          :disabled="isTransitioning"
          size="small"
          text
          class="shrink-0"
          @click.stop="runAction(action)"
        />
        <Button
          v-if="hasOverflowContent"
          icon="pi pi-ellipsis-h"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('common.more')"
          @click.stop="toggle"
        />
      </div>

      <Popover ref="op">
          <div class="flex flex-col gap-4 min-w-72 max-w-96">
              <div v-if="overflowActions.length" class="flex flex-col gap-2">
                  <Button
                      v-for="action in overflowActions"
                      :key="action.to || action.label"
                      :label="action.label"
                      :icon="action.icon"
                      :severity="action.severity || 'secondary'"
                      :disabled="isTransitioning"
                      size="small"
                      text
                      class="justify-start whitespace-normal text-left"
                      @click.stop="runAction(action)"
                  />
              </div>

              <Divider v-if="overflowActions.length && (hasLocation || showHistory)" />

              <div v-if="hasLocation" class="flex flex-col gap-3">
                  <StatusLocation :entity="entity" />
              </div>

              <template v-if="showHistory">
                <Divider v-if="hasLocation" />
                <StatusHistory :entity="entity" :entity-type="entityType" compact />
              </template>

              <slot name="extra"></slot>
          </div>
      </Popover>
    </template>

    <template v-else>
        <div class="flex flex-col gap-2 min-w-0 max-w-full">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
                <StatusBadge :state="state" class="max-w-full" />
            </div>

            <StatusLocation v-if="hasLocation" :entity="entity" />

            <StatusHistory v-if="showHistory" :entity="entity" :entity-type="entityType" compact />

            <div v-if="hasActions" class="flex flex-wrap gap-2">
                <Button
                    v-for="action in inlineActions"
                    :key="action.to || action.label"
                    :label="action.label"
                    :icon="action.icon"
                    :severity="action.severity || 'secondary'"
                    :disabled="isTransitioning"
                    size="small"
                    @click.stop="runAction(action)"
                />
                <Button
                    v-if="overflowActions.length"
                    icon="pi pi-ellipsis-h"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    :aria-label="$t('common.more')"
                    @click.stop="toggle"
                />
            </div>

            <Popover ref="op">
                <div class="flex flex-col gap-2 min-w-56">
                    <Button
                        v-for="action in overflowActions"
                        :key="action.to || action.label"
                        :label="action.label"
                        :icon="action.icon"
                        :severity="action.severity || 'secondary'"
                        :disabled="isTransitioning"
                        size="small"
                        text
                        class="justify-start whitespace-normal text-left"
                        @click.stop="runAction(action)"
                    />
                </div>
            </Popover>

            <slot name="extra"></slot>
        </div>
    </template>
  </div>
</template>
