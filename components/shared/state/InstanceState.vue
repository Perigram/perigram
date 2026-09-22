<script setup>
/**
 * InstanceState - v24 Absolute Final
 * Mandatory component for managing entity states and transitions.
 * Integrates display (StatusBadge) and logic (useStateController).
 */
import { ref, computed, inject, onUnmounted, toRef, unref, watch } from 'vue';
import Popover from 'primevue/popover';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import StateHistory from '~/components/shared/state/StateHistory.vue';
import StateLocation from '~/components/shared/state/StateLocation.vue';
import StateTransitionDialog from '~/components/shared/state/StateTransitionDialog.vue';
import { useStatus } from '~/composables/useBlocks';
import { useStateController } from '~/composables/useStateController';
import { createStatusAction, getWorkflowStateActions, hasMeaningfulWorkflowState, hasWorkflow } from '~/utils/state-actions.js';
import { onInstanceChanged } from '~/utils/instance-events.js';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true }, // e.g. 'project', 'queue'
  variant: { type: String, default: 'inline' }, // icon, inline, full
  showActions: { type: Boolean, default: true },
  actions: { type: Array, default: () => [] }, // preferred action API
  manualActions: { type: Array, default: () => [] }, // backward compatibility
  expanded: { type: Boolean, default: null }, // auto-expands only for full status surfaces
  maxInlineActions: { type: Number, default: null },
  showHistory: { type: Boolean, default: true },
  workflows: { type: Object, default: null }
});

const emit = defineEmits(['transitioned', 'refresh']);
const { t } = useI18n();
const toast = useToast();
const { state, regions, metadata } = useStatus(toRef(props, 'entity'));
const { transition, fetchActions, isTransitioning } = useStateController();
const op = ref();
const evidenceAction = ref(null);
const evidenceDialogVisible = ref(false);
const serverActions = ref([]);
const providedWorkflows = inject('stateWorkflows', null);
const localTransitionHandler = inject('statusTransitionHandler', null);

const toggle = (event) => {
    op.value?.toggle(event);
};

const instanceId = computed(() => props.entity?._id || props.entity?.identity?.uid || props.entity?.identity?.slug);
const localWorkflows = computed(() => props.workflows || unref(providedWorkflows) || null);
const displaysLifecycleStatus = computed(() => hasMeaningfulWorkflowState(
    props.typeId,
    localWorkflows.value || undefined
) || (props.variant === 'icon' && Boolean(props.entity?.states)));
const hasRegisteredWorkflow = computed(() => hasWorkflow(props.typeId, localWorkflows.value || undefined));
const useServerActions = computed(() => props.showActions && !localWorkflows.value && hasRegisteredWorkflow.value);
const useLocalTransition = computed(() => Boolean(localWorkflows.value && localTransitionHandler));

// Available transitions (to be fetched or derived from a machine registry if available)
const handleTransition = async (targetState, action = {}, evidence = {}) => {
    try {
        const result = useLocalTransition.value
            ? await localTransitionHandler({
                typeId: props.typeId,
                targetId: instanceId.value,
                targetState,
                intent: action.intent || null,
                region: action.region || 'main',
                path: action.path || null,
                entity: props.entity,
                ...evidence
            })
            : await transition(props.typeId, instanceId.value, targetState, {
                ...evidence,
                ...(action.intent ? { intent: action.intent } : {}),
                region: action.region || 'main',
                path: action.path || null
            });
        emit('transitioned', targetState, result);
        toast.add({
            severity: 'success',
            summary: t('common.success'),
            detail: t('status.transitionSucceeded'),
            life: 3000
        });
        await refreshServerActions();
        op.value?.hide?.();
    } catch (e) {
        toast.add({
            severity: 'error',
            summary: t('common.error'),
            detail: e?.data?.message || e?.message || t('status.transitionFailed'),
            life: 5000
        });
        await refreshServerActions();
        emit('refresh');
    }
};

const refreshServerActions = async () => {
    if (!useServerActions.value || !instanceId.value) {
        serverActions.value = [];
        return;
    }

    try {
        serverActions.value = await fetchActions(props.typeId, instanceId.value);
    } catch {
        serverActions.value = [];
    }
};

watch(
    [() => props.typeId, instanceId, state, useServerActions],
    () => refreshServerActions(),
    { immediate: true }
);

const stopEntityChangeListener = onInstanceChanged(({ type, id, entity }) => {
    if (!matchesEntityChange({ type, id, entity })) return;
    emit('refresh');
});

onUnmounted(() => {
    stopEntityChangeListener();
});

const customActions = computed(() => {
    const source = Array.isArray(props.actions) && props.actions.length > 0
        ? props.actions
        : Array.isArray(props.manualActions) && props.manualActions.length > 0
            ? props.manualActions
            : [];

    return source
        .filter(action => Boolean(action?.to || action?.intent))
        .map(action => normalizeCustomAction(action));
});

const defaultTransitions = computed(() => {
    if (useServerActions.value) {
        return serverActions.value.map(action => createStatusAction(action, undefined, t));
    }

    return getWorkflowStateActions({
        typeId: props.typeId,
        state: state.value,
        workflows: localWorkflows.value || undefined,
        t
    });
});

const effectiveActions = computed(() => {
    if (!props.showActions) return [];
    const seen = new Set();
    return [
        ...defaultTransitions.value,
        ...customActions.value
    ].filter(action => {
        if (!action || action.display === false || action.display === 'hidden') return false;
        const key = actionKey(action);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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

    if (action.to) {
        if (actionRequiresEvidence(action)) {
            evidenceAction.value = action;
            evidenceDialogVisible.value = true;
            return;
        }
        await handleTransition(action.to, action);
        return;
    }

    if (typeof action.command === 'function') {
        await action.command();
        emit('transitioned', action.label || null);
        op.value?.hide?.();
    }
};

const submitEvidenceTransition = async (evidence = {}) => {
    const action = evidenceAction.value;
    if (!action?.to) return;
    await handleTransition(action.to, action, evidence);
    evidenceDialogVisible.value = false;
    evidenceAction.value = null;
};

function normalizeCustomAction(action = {}) {
    const display = action.display || action.displayBtn
        ? action.display || 'inline'
        : (action.to || action.intent ? 'inline' : 'menu');
    return {
        ...action,
        display
    };
}

function actionKey(action = {}) {
    return [
        action.region || 'main',
        action.intent || '',
        action.to || '',
        normalizeLabel(action.label || '')
    ].join(':');
}

function actionRequiresEvidence(action = {}) {
    const lifecycle = action.lifecycle || {};
    return Boolean(
        lifecycle.description ||
        Object.keys(lifecycle.attachments || {}).length > 0 ||
        Object.keys(lifecycle.snapshots || {}).length > 0
    );
}

const secondaryRegions = computed(() => regions.value.filter(region => region.id !== 'main'));
const statusDisplay = computed(() => metadata.value?.display || null);
const regionDisplay = computed(() => metadata.value?.regions || {});

function normalizeLabel(value = '') {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function matchesEntityChange({ type, id, entity } = {}) {
    if (normalizeEventType(type) !== normalizeEventType(props.typeId)) return false;

    const changedId = id || entity?._id || entity?.identity?.uid || entity?.identity?.slug;
    if (!changedId || !instanceId.value) return false;

    return changedId.toString() === instanceId.value.toString();
}

function normalizeEventType(type) {
    return String(type || '').replace(/_/g, '').toLowerCase();
}
</script>

<template>
  <div
    v-if="props.entity && displaysLifecycleStatus"
    class="entity-status inline-flex min-w-0 max-w-full justify-end"
    data-instance-card-interactive="true"
    data-entity-status="true"
    :data-type-id="typeId"
    :data-entity-id="instanceId"
    @click.stop
  >
    <template v-if="!isExpanded">
      <div class="flex min-w-0 max-w-48 flex-wrap items-center justify-end gap-1.5 sm:max-w-56">
        <StatusBadge
          :state="state"
          :display="statusDisplay"
          :icon-only="variant === 'icon'"
          class="cursor-pointer min-w-0 max-w-full shrink"
          @click.stop="toggle"
        />
        <StatusBadge
          v-for="region in secondaryRegions"
          :key="region.id"
          :state="region.state"
          :display="regionDisplay[region.id]"
          icon-only
          class="cursor-pointer shrink-0"
          @click.stop="toggle"
        />
        <Button
          v-for="action in inlineActions"
          :key="action.to || action.label"
          :label="action.label"
          :icon="action.icon"
          :severity="action.severity || 'secondary'"
          :disabled="isTransitioning"
          :data-status-action="action.to || action.label"
          size="small"
          text
          class="shrink-0"
          @click.stop="runAction(action)"
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
                      :data-status-action="action.to || action.label"
                      size="small"
                      text
                      class="justify-start whitespace-normal text-left"
                      @click.stop="runAction(action)"
                  />
              </div>

              <Divider v-if="overflowActions.length && (hasLocation || showHistory)" />

              <div v-if="hasLocation" class="flex flex-col gap-3">
                  <StateLocation :entity="entity" />
              </div>

              <template v-if="showHistory">
                <Divider v-if="hasLocation" />
                <StateHistory :entity="entity" :type-id="typeId" compact />
              </template>

              <slot name="extra"></slot>
          </div>
      </Popover>
    </template>

    <template v-else>
        <div class="flex flex-col gap-2 min-w-0 max-w-full">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
                <StatusBadge :state="state" :display="statusDisplay" class="max-w-full" />
                <StatusBadge
                    v-for="region in secondaryRegions"
                    :key="region.id"
                    :state="region.state"
                    :display="regionDisplay[region.id]"
                    icon-only
                    class="shrink-0"
                />
            </div>

            <StateLocation v-if="hasLocation" :entity="entity" />

            <StateHistory v-if="showHistory" :entity="entity" :type-id="typeId" compact />

            <div v-if="hasActions" class="flex flex-wrap gap-2">
                <Button
                    v-for="action in inlineActions"
                    :key="action.to || action.label"
                    :label="action.label"
                    :icon="action.icon"
                    :severity="action.severity || 'secondary'"
                    :disabled="isTransitioning"
                    :data-status-action="action.to || action.label"
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
                    data-status-menu-trigger="true"
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
                        :data-status-action="action.to || action.label"
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

    <StateTransitionDialog
      v-model:visible="evidenceDialogVisible"
      :action="evidenceAction"
      :loading="isTransitioning"
      @submit="submitEvidenceTransition"
    />
  </div>
</template>
