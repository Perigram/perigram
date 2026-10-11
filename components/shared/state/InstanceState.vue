<script setup>
/**
 * InstanceState — the shared instance chrome's status surface.
 *
 * Flat state contract (SPEC §7): the value is the instance's flat wire
 * `state` string; the vocabulary and display policy derive from the
 * compiled producer workflows the hydration payload carries
 * (statePolicyByType/stateDisplayFor — the same resolvers generated
 * screens use). A type without a served vocabulary renders no state
 * surface at all; unknown values degrade to the neutral stop-line chip;
 * dotted values render as segmented paths.
 */
import { ref, computed, onUnmounted, watch } from 'vue';
import Popover from 'primevue/popover';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import StateHistory from '~/components/shared/state/StateHistory.vue';
import StateTransitionDialog from '~/components/shared/state/StateTransitionDialog.vue';
import { useStateController } from '~/composables/useStateController';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { stateDisplayFor } from '#shared/ui-mapping/index.js';
import { onInstanceChanged } from '~/utils/instance-events.js';

const props = defineProps({
    instance: { type: Object, required: true },
    typeId: { type: String, required: true },
    variant: { type: String, default: 'inline' }, // icon, inline, full
    showActions: { type: Boolean, default: true },
    actions: { type: Array, default: () => [] }, // preferred action API
    expanded: { type: Boolean, default: null }, // auto-expands only for full status surfaces
    maxInlineActions: { type: Number, default: null },
    showHistory: { type: Boolean, default: true }
});

const emit = defineEmits(['transitioned', 'refresh']);
const { t } = useI18n();
const toast = useToast();
const { transition, fetchActions, isTransitioning } = useStateController();
const { policyFor } = useStatePolicy();
const op = ref();
const evidenceAction = ref(null);
const evidenceDialogVisible = ref(false);
const serverActions = ref([]);

const toggle = (event) => {
    op.value?.toggle(event);
};

const instanceId = computed(() => props.instance?._id || props.instance?._id || props.instance?.identity?.slug);
const policyByValue = policyFor(() => props.typeId);
const stateValue = computed(() => {
    const value = props.instance?.state;
    return typeof value === 'string' && value ? value : '';
});
const display = computed(() => stateDisplayFor(policyByValue.value, stateValue.value));
// Rendering guard: no vocabulary or no value → no state surface at all.
const displaysState = computed(() => Boolean(display.value));
const hasVocabulary = computed(() => Boolean(policyByValue.value) && Object.keys(policyByValue.value).length > 0);

const handleTransition = async (targetState, action = {}, evidence = {}) => {
    try {
        const result = await transition(props.typeId, instanceId.value, targetState, {
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
    if (!props.showActions || !hasVocabulary.value || !instanceId.value) {
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
    [() => props.typeId, instanceId, stateValue, hasVocabulary],
    () => refreshServerActions(),
    { immediate: true }
);

const stopInstanceChangeListener = onInstanceChanged(({ type, id, instance }) => {
    if (!matchesInstanceChange({ type, id, instance })) return;
    emit('refresh');
});

onUnmounted(() => {
    stopInstanceChangeListener();
});

// Custom actions ride the same shape as server transitions; their display
// policy resolves through the flat vocabulary like every other target.
const customActions = computed(() => {
    return (Array.isArray(props.actions) ? props.actions : [])
        .filter(action => Boolean(action?.to || action?.intent))
        .map(action => normalizeCustomAction(action));
});

const defaultTransitions = computed(() => {
    return serverActions.value.map(action => flatStatusAction(action));
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
const hasOverflowContent = computed(() => overflowActions.value.length > 0 || props.showHistory);
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

// A transition's label/severity/icon resolve through the flat vocabulary —
// the authored policy of the target value, never a local heuristic.
function flatStatusAction(action = {}) {
    const to = action.to || action.state?.to || '';
    const targetDisplay = stateDisplayFor(policyByValue.value, to);
    return {
        label: action.label || targetDisplay?.label || to,
        to,
        region: action.region || 'main',
        path: action.path || [to],
        intent: action.intent || null,
        severity: targetDisplay?.severity || 'secondary',
        icon: targetDisplay?.icon || null,
        display: resolveActionDisplay(action),
        lifecycle: action.lifecycle || null
    };
}

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

function resolveActionDisplay(action = {}) {
    if (action.display === false || action.displayBtn === false) return 'hidden';
    if (action.display === 'hidden' || action.display === 'menu' || action.display === 'inline') return action.display;
    if (action.displayBtn === true) return 'inline';
    if (action.from && action.from === action.to) return 'hidden';
    return 'inline';
}

function normalizeLabel(value = '') {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function matchesInstanceChange({ type, id, instance } = {}) {
    if (normalizeEventType(type) !== normalizeEventType(props.typeId)) return false;

    const changedId = id || instance?._id || instance?._id || instance?.identity?.slug;
    if (!changedId || !instanceId.value) return false;

    return changedId.toString() === instanceId.value.toString();
}

function normalizeEventType(type) {
    return String(type || '').replace(/_/g, '').toLowerCase();
}
</script>

<template>
  <div
    v-if="displaysState"
    class="instance-status inline-flex min-w-0 max-w-full justify-end"
    data-instance-card-interactive="true"
    data-instance-status="true"
    :data-type-id="typeId"
    :data-instance-id="instanceId"
    @click.stop
  >
    <template v-if="!isExpanded">
      <div class="flex min-w-0 max-w-48 flex-wrap items-center justify-end gap-1.5 sm:max-w-56">
        <StateTag
          :policy="policyByValue"
          :value="stateValue"
          class="cursor-pointer min-w-0 max-w-full shrink"
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

              <Divider v-if="overflowActions.length && showHistory" />

              <template v-if="showHistory">
                <StateHistory :instance="instance" :type-id="typeId" compact />
              </template>

              <slot name="extra"></slot>
          </div>
      </Popover>
    </template>

    <template v-else>
        <div class="flex flex-col gap-2 min-w-0 max-w-full">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
                <StateTag :policy="policyByValue" :value="stateValue" class="max-w-full" />
            </div>

            <StateHistory v-if="showHistory" :instance="instance" :type-id="typeId" compact />

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
