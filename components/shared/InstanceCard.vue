<template>
    <!-- Inline: pill chip with popup -->
    <template v-if="variant === 'inline'">
        <span
            class="inline-flex min-w-0 max-w-full items-center gap-2 align-middle"
            :class="{ 'cursor-pointer': expandable }"
            :role="expandable ? 'button' : undefined"
            :tabindex="expandable ? 0 : undefined"
            data-instance-card-interactive="true"
            @click="togglePopup"
            @keydown="onToggleKeydown"
        >
            <span class="instance-inline-chip max-w-full" :title="identityLabel">
                <i v-if="instanceConfig.icon" :class="['instance-inline-chip-icon', instanceConfig.icon]" aria-hidden="true"></i>
                <span class="instance-inline-chip-label">{{ identityLabel }}</span>
            </span>
            <slot name="inline-extra" />
        </span>
    </template>

    <!-- Compact: identity + status in a card row -->
    <template v-else-if="variant === 'compact'">
        <Card
            class="h-full overflow-hidden"
            :class="{ 'cursor-pointer': expandable }"
            :role="expandable ? 'button' : undefined"
            :tabindex="expandable ? 0 : undefined"
            data-instance-card-interactive="true"
            @click="togglePopup"
            @keydown="onToggleKeydown"
        >
            <template #content>
            <template v-if="$slots.header">
                <slot name="header" />
            </template>
            <div class="flex flex-wrap items-start justify-between gap-3 min-w-0" :class="{ 'mt-2': $slots.header }">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <template v-if="$slots.title">
                        <slot name="title" />
                    </template>
                    <template v-else>
                        <slot name="before-identity" />
                        <div class="flex min-w-0 items-center gap-2">
                            <i v-if="instanceConfig.icon" :class="instanceConfig.icon" class="shrink-0 text-muted" aria-hidden="true"></i>
                            <span class="truncate" :title="identityLabel">{{ identityLabel }}</span>
                        </div>
                    </template>
                </div>
                <div v-if="effectiveShowStatus" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
                    <InstanceState
                        :instance="instance"
                        :type-id="typeId"
                        variant="inline"
                        :actions="stateActions"
                        @refresh="$emit('refresh')"
                        @transitioned="$emit('refresh')"
                    />
                </div>
            </div>
            <template v-if="$slots.subtitle">
                <div class="mt-2 text-muted text-body">
                    <slot name="subtitle" />
                </div>
            </template>
            <slot name="compact-content" />
            </template>
        </Card>
    </template>

    <!-- Card: full semantic structure; visual chrome remains Aura-owned. -->
    <template v-else>
        <Card class="h-full overflow-hidden">
            <template #header v-if="$slots.header">
                <slot name="header" />
            </template>
            <template #title>
                <template v-if="$slots.title">
                    <slot name="title" />
                </template>
                <template v-else>
                    <TraceChain v-if="effectiveShowTrace" :entity="instance" :type-id="typeId" :exclude="traceExclusions" variant="compact" expandable class="mb-2" />
                    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
                        <div class="flex min-w-0 flex-1 items-center gap-2">
                            <slot name="before-identity" />
                            <div class="flex min-w-0 items-center gap-2">
                                <i v-if="instanceConfig.icon" :class="instanceConfig.icon" class="shrink-0 text-muted" aria-hidden="true"></i>
                                <span class="truncate" :title="identityLabel">{{ identityLabel }}</span>
                            </div>
                        </div>
                        <div v-if="effectiveShowStatus" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
                            <InstanceState
                                :instance="instance"
                                :type-id="typeId"
                                variant="inline"
                                :actions="stateActions"
                                @refresh="$emit('refresh')"
                                @transitioned="$emit('refresh')"
                            />
                        </div>
                    </div>
                </template>
            </template>
            <template #subtitle v-if="$slots.subtitle">
                <div class="text-muted text-body">
                    <slot name="subtitle" />
                </div>
            </template>
            <template #content>
                <slot />
            </template>
            <template #footer>
                <div class="flex flex-wrap items-center justify-end gap-2" @click.stop>
                  <Button
                    icon="pi pi-comments"
                    text
                    size="small"
                    :aria-label="$t('support.instanceChat')"
                    @click="openCardChat"
                  />
                  <InstanceActionsPopover v-if="footerDisplay === 'menu' && $slots.footer">
                    <slot name="footer" />
                  </InstanceActionsPopover>
                  <slot v-else name="footer" />
                </div>
            </template>
        </Card>
    </template>

    <!-- One shared expansion surface for inline and compact variants: type
         label + identity header, lineage context, the same canonical body
         the full card uses, and an inline action row — generated commands
         and the detail route render directly, never behind a second
         ellipsis inside the popover. -->
    <Popover v-if="variant === 'inline' || variant === 'compact'" ref="op">
        <div class="w-[min(34rem,calc(100vw-3rem))]">
            <div class="flex flex-col gap-3 p-4">
                <!-- The popup identity block (type label, status, identity
                     row, trace) is replaceable: cards with their own
                     directory-grade face (user, organization) render the
                     avatar-forward header and own the whole block. -->
                <slot name="popup-identity">
                    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <small v-if="inlineTypeLabel" class="uppercase text-muted text-supporting">
                            {{ inlineTypeLabel }}
                        </small>
                        <InstanceState
                            v-if="effectiveShowStatus"
                            :instance="instance"
                            :type-id="typeId"
                            variant="inline"
                            :actions="stateActions"
                            @refresh="$emit('refresh')"
                            @transitioned="$emit('refresh')"
                        />
                    </div>
                    <div class="flex min-w-0 items-center gap-2">
                        <i v-if="instanceConfig.icon" :class="instanceConfig.icon" class="shrink-0 text-muted" aria-hidden="true"></i>
                        <span class="truncate" :title="identityLabel">{{ identityLabel }}</span>
                    </div>
                    <TraceChain
                        v-if="effectivePopupShowTrace"
                        :entity="instance"
                        :type-id="typeId"
                        :exclude="traceExclusions"
                    />
                </slot>
                <div class="instance-card-popup-content flex flex-col gap-3">
                    <slot name="expanded">
                        <slot />
                    </slot>
                    <slot name="footer" />
                </div>
                <!-- The instance chat entry always renders: every card opens its
                     composed conversation. -->
                <Divider class="m-0" />
                <div class="flex flex-wrap items-center justify-end gap-2" @click.stop>
                    <Button
                        icon="pi pi-comments"
                        text
                        size="small"
                        :aria-label="$t('support.instanceChat')"
                        @click="openCardChat"
                    />
                    <GeneratedEditorPageAction
                        v-if="inlineHasEditorAction"
                        :entity="inlineActionInstance"
                        :type-id="inlineEditorTypeId"
                    />
                    <GeneratedActionButton
                        v-for="actionId in inlineActionIds"
                        :key="actionId"
                        :action-id="actionId"
                        size="small"
                        @execute="executeInlineAction"
                    />
                    <Button
                        v-if="inlineDetailRoute || inlineOpenDetailRef"
                        :label="$t('common.open')"
                        icon="pi pi-external-link"
                        text
                        size="small"
                        :aria-label="$t('common.open')"
                        @click="inlineOpenDetailRef || openInlineDetail"
                    />
                </div>
            </div>
        </div>
    </Popover>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, unref } from 'vue';
/**
 * InstanceCard - v24 Standardized
 * Shared instance card structure: TraceChain + identity chrome + InstanceState.
 * Entity-specific cards use this as their container, providing only
 * instance-specific body/footer content via slots.
 *
 * Slots:
 *   header           — custom card header slot
 *   title            — overrides default identity/status row
 *   subtitle         — optional subtitle row
 *   before-identity  — prefix in title row (e.g. queue number badge)
 *   default          — body content (card variant)
 *   compact-content  — extra content in compact row
 *   inline-extra     — suffix in inline row
 *   footer           — footer actions (card variant; inline by default)
 */
import InstanceState from '~/components/shared/state/InstanceState.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import InstanceActionsPopover from '~/components/shared/InstanceActionsPopover.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Popover from 'primevue/popover';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedEditorPageAction from '~/components/generated/GeneratedEditorPageAction.vue';
import { instanceHasEditorAction } from '~/components/generated/instance-editor-action.js';
import { useRegistryStore } from '~/stores/registry';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { useI18n } from 'vue-i18n';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { instanceHierarchyIds } from '~/utils/instance-hierarchy.js';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

const props = defineProps({
    instance: { type: Object, required: true },
    typeId: { type: String, required: true },
    variant: { type: String, default: 'card' },
    surface: { type: String, default: null },
    showStatus: { type: Boolean, default: null },
    showTrace: { type: Boolean, default: null },
    expandable: { type: Boolean, default: true },
    density: { type: String, default: 'default' },
    stateActions: { type: Array, default: () => [] },
    displayExtensions: { type: Object, default: null },
    displayOverrides: { type: Object, default: null },
    contextInstance: { type: Object, default: null },
    contextTypeId: { type: String, default: '' },
    footerDisplay: { type: String, default: 'inline', validator: value => ['menu', 'inline'].includes(value) }
});

const emit = defineEmits(['refresh']);

const cardInstanceId = computed(() => {
    const id = props.instance?._id || props.instance?.id || props.instance?.identity?.uid || '';
    return id ? String(id) : '';
});

function openCardChat() {
    op.value?.hide?.();
    openInstanceChat({
        type: props.typeId,
        id: cardInstanceId.value,
        name: props.instance?.identity?.name || ''
    });
}
const inlineDetailRouteRef = inject('instanceInlineDetailRoute', null);
// Workspace-aware open handler from the hosting inline ref: when present,
// the open action routes through it (pane tab / home dialog) instead of a
// raw navigateTo, so card popovers obey the same everything-inside-home
// rule the compact popover does.
const inlineOpenDetailRef = inject('instanceInlineOpenDetail', null);
const inlineForceTraceRef = inject('instanceInlineForceTrace', false);
const inlineTypeLabelRef = inject('instanceInlineTypeLabel', '');
const inlineActionIdsRef = inject('instanceInlineActionIds', []);
const inlineActionEntityRef = inject('instanceInlineActionEntity', null);
const inlineActionTypeIdRef = inject('instanceInlineActionTypeId', '');
const inlineHasEditorActionRef = inject('instanceInlineHasEditorAction', false);
const inlineExecuteActionRef = inject('instanceInlineExecuteAction', null);

const { t } = useI18n();
const registry = useRegistryStore();
// Render-policy icons are the single icon source:
// the legacy instanceUiFor table died with the per-surface icon drift.
const instanceConfig = computed(() => ({ icon: registry.iconFor(props.typeId) }));
const displayPlan = computed(() => resolveInstanceDisplayContract({
    typeId: props.typeId,
    surface: props.surface || props.variant,
    variant: props.variant,
    extensions: props.displayExtensions,
    overrides: props.displayOverrides
}));
const { policyFor } = useStatePolicy();
const statePolicy = policyFor(() => props.typeId);
const effectiveShowStatus = computed(() => {
    if (!statePolicy.value || !Object.keys(statePolicy.value).length) return false;
    if (props.showStatus !== null) return props.showStatus;
    return displayPlan.value.surfaceContract.status === 'interactive'
        || displayPlan.value.surfaceContract.status === 'readonly';
});
const effectiveShowTrace = computed(() => {
    if (props.showTrace !== null) return props.showTrace;
    return displayPlan.value.surfaceContract.trace !== 'hidden';
});
const effectivePopupShowTrace = computed(() => effectiveShowTrace.value || Boolean(unref(inlineForceTraceRef)));
const traceExclusions = computed(() => {
    if (!props.contextInstance || !props.contextTypeId) return [];
    return instanceHierarchyIds(props.contextInstance).map(id => ({
        type: props.contextTypeId,
        id
    }));
});
// Record titles resolve through the one title resolver: the DTO maps
// through the wire-to-screen bridge against the bundle type record, so
// the declared identifier field wins and raw ids never render; a record
// without a declared title is unnamed.
const typeView = computed(() => registry.typeRecord(props.typeId));
const identityLabel = computed(() => titleFor(
  typeView.value ? dtoToScreenInstance(props.instance, typeView.value) : null,
  typeView.value,
  { unnamedLabel: t('common.unnamed') }
));
const inlineDetailRoute = computed(() => unref(inlineDetailRouteRef));
const inlineTypeLabel = computed(() => unref(inlineTypeLabelRef) || '');
const inlineActionIds = computed(() => unref(inlineActionIdsRef) || []);
const inlineActionInstance = computed(() => unref(inlineActionEntityRef) || props.instance);
const inlineEditorTypeId = computed(() => unref(inlineActionTypeIdRef) || '');
const inlineHasEditorAction = computed(() => Boolean(unref(inlineHasEditorActionRef)) || instanceHasEditorAction(inlineEditorTypeId.value));
const inlinePopupHasActions = computed(() => (
    inlineHasEditorAction.value
    || inlineActionIds.value.length
));

function openInlineDetail(event) {
    event.stopPropagation();
    requestCloseMobileTransientSurfaces();
    if (inlineDetailRoute.value) navigateTo(inlineDetailRoute.value);
}

function executeInlineAction(action) {
    const executor = unref(inlineExecuteActionRef);
    if (typeof executor !== 'function') return;
    executor(action);
}

const op = ref();
const togglePopup = (event) => {
    if (!props.expandable || isInteractiveEventTarget(event)) return;
    op.value.toggle(event);
};
const onToggleKeydown = (event) => {
    if (!props.expandable || isInteractiveEventTarget(event)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    togglePopup(event);
};

function closePopup() {
    op.value?.hide?.();
}

onMounted(() => {
    window.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closePopup);
});

onUnmounted(() => {
    window.removeEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closePopup);
});
</script>
