<template>
    <!-- Inline: pill chip with popup -->
    <template v-if="variant === 'inline'">
        <span
            class="inline-flex min-w-0 max-w-full items-center gap-2 align-middle"
            :class="{ 'cursor-pointer': expandable }"
            :role="expandable ? 'button' : undefined"
            :tabindex="expandable ? 0 : undefined"
            data-entity-card-interactive="true"
            @click="togglePopup"
            @keydown="onToggleKeydown"
        >
            <IdentityBlock :entity="entity" variant="inline" :icon="entityConfig.icon" />
            <slot name="inline-extra" />
        </span>
        
        <Popover ref="op" class="[box-shadow:var(--ck-shadow-overlay)] border border-content-border">
            <div class="w-[min(34rem,calc(100vw-3rem))]">
                <div class="flex flex-col gap-4 p-4">
            <TraceChain v-if="effectivePopupShowTrace" :entity="entity" :entity-type="entityType" />
                    <small v-if="inlineTypeLabel" class="text-xs uppercase tracking-[0.08em] text-muted-color">
                        {{ inlineTypeLabel }}
                    </small>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <IdentityBlock :entity="entity" />
                        <EntityStatus
                            v-if="effectiveShowStatus"
                            :entity="entity"
                            :entity-type="entityType"
                            variant="inline"
                            :actions="statusActions"
                            @refresh="$emit('refresh')"
                            @transitioned="$emit('refresh')"
                        />
                    </div>
                    <div class="entity-card-popup-content flex flex-col gap-3">
                        <slot name="expanded">
                            <slot />
                        </slot>
                        <slot name="footer" />
                    </div>
                    <div v-if="inlinePopupHasActions || inlineDetailRoute" class="flex justify-end" @click.stop>
                      <EntityActionsPopover>
                        <GeneratedCassetteDesignerAction
                            v-if="inlineShowCassetteDesigner"
                            :entity="inlineActionEntity"
                            menu-item
                        />
                        <GeneratedActionButton
                            v-for="actionId in inlineActionIds"
                            :key="actionId"
                            :action-id="actionId"
                            menu-item
                            @execute="executeInlineAction"
                        />
                        <GeneratedDeleteButton
                            v-if="inlineCanDelete"
                            :entity="inlineActionEntity"
                            :entity-type="inlineActionEntityType"
                            menu-item
                            @deleted="closePopup"
                        />
                        <Button
                            v-if="inlineDetailRoute"
                            :label="$t('common.open')"
                            icon="pi pi-external-link"
                            text
                            size="small"
                            class="w-full justify-start"
                            :aria-label="$t('common.open')"
                            @click="openInlineDetail"
                        />
                      </EntityActionsPopover>
                    </div>
                </div>
            </div>
        </Popover>
    </template>

    <!-- Compact: identity + status in a card row -->
    <template v-else-if="variant === 'compact'">
        <Card
            class="h-full overflow-hidden border border-content-border [box-shadow:var(--ck-shadow-card)] hover:[box-shadow:var(--ck-shadow-card-hover)] transition-shadow duration-normal"
            :class="[{ 'cursor-pointer': expandable }, compactDensityClass]"
            :role="expandable ? 'button' : undefined"
            :tabindex="expandable ? 0 : undefined"
            data-entity-card-interactive="true"
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
                        <IdentityBlock :entity="entity" variant="compact" />
                    </template>
                </div>
                <div v-if="effectiveShowStatus" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
                    <EntityStatus
                        :entity="entity"
                        :entity-type="entityType"
                        variant="inline"
                        :actions="statusActions"
                        @refresh="$emit('refresh')"
                        @transitioned="$emit('refresh')"
                    />
                </div>
            </div>
            <template v-if="$slots.subtitle">
                <div class="mt-2 text-sm text-muted-color">
                    <slot name="subtitle" />
                </div>
            </template>
            <slot name="compact-content" />
            </template>
        </Card>
        <Popover ref="op" class="[box-shadow:var(--ck-shadow-overlay)] border border-content-border">
            <div class="w-[min(34rem,calc(100vw-3rem))]">
                <div class="flex flex-col gap-4 p-4">
                    <TraceChain v-if="effectivePopupShowTrace" :entity="entity" :entity-type="entityType" />
                    <small v-if="inlineTypeLabel" class="text-xs uppercase tracking-[0.08em] text-muted-color">
                        {{ inlineTypeLabel }}
                    </small>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <IdentityBlock :entity="entity" />
                        <EntityStatus
                            v-if="effectiveShowStatus"
                            :entity="entity"
                            :entity-type="entityType"
                            variant="inline"
                            :actions="statusActions"
                            @refresh="$emit('refresh')"
                            @transitioned="$emit('refresh')"
                        />
                    </div>
                    <div class="entity-card-popup-content flex flex-col gap-3">
                        <slot name="expanded">
                            <slot />
                        </slot>
                        <slot name="footer" />
                    </div>
                    <div v-if="inlinePopupHasActions || inlineDetailRoute" class="flex justify-end" @click.stop>
                      <EntityActionsPopover>
                        <GeneratedCassetteDesignerAction
                            v-if="inlineShowCassetteDesigner"
                            :entity="inlineActionEntity"
                            menu-item
                        />
                        <GeneratedActionButton
                            v-for="actionId in inlineActionIds"
                            :key="actionId"
                            :action-id="actionId"
                            menu-item
                            @execute="executeInlineAction"
                        />
                        <GeneratedDeleteButton
                            v-if="inlineCanDelete"
                            :entity="inlineActionEntity"
                            :entity-type="inlineActionEntityType"
                            menu-item
                            @deleted="closePopup"
                        />
                        <Button
                            v-if="inlineDetailRoute"
                            :label="$t('common.open')"
                            icon="pi pi-external-link"
                            text
                            size="small"
                            class="w-full justify-start"
                            :aria-label="$t('common.open')"
                            @click="openInlineDetail"
                        />
                      </EntityActionsPopover>
                    </div>
                </div>
            </div>
        </Popover>
    </template>

    <!-- Card: full chrome — tracechain / identity+status / body / footer -->
    <template v-else>
        <Card class="h-full overflow-hidden border border-content-border [box-shadow:var(--ck-shadow-card)] hover:[box-shadow:var(--ck-shadow-card-hover)] transition-shadow duration-normal">
            <template #header v-if="$slots.header">
                <slot name="header" />
            </template>
            <template #title>
                <template v-if="$slots.title">
                    <slot name="title" />
                </template>
                <template v-else>
                    <TraceChain v-if="effectiveShowTrace" :entity="entity" :entity-type="entityType" variant="compact" expandable class="mb-2" />
                    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
                        <div class="flex min-w-0 flex-1 items-center gap-2">
                            <slot name="before-identity" />
                            <IdentityBlock :entity="entity" />
                        </div>
                        <div v-if="effectiveShowStatus" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
                            <EntityStatus
                                :entity="entity"
                                :entity-type="entityType"
                                variant="inline"
                                :actions="statusActions"
                                @refresh="$emit('refresh')"
                                @transitioned="$emit('refresh')"
                            />
                        </div>
                    </div>
                </template>
            </template>
            <template #subtitle v-if="$slots.subtitle">
                <div class="text-sm text-muted-color">
                    <slot name="subtitle" />
                </div>
            </template>
            <template #content>
                <slot />
            </template>
            <template #footer>
                <div v-if="$slots.footer" class="flex justify-end" @click.stop>
                  <EntityActionsPopover>
                    <slot name="footer" />
                  </EntityActionsPopover>
                </div>
            </template>
        </Card>
    </template>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, unref } from 'vue';
/**
 * EntityCard - v24 Standardized
 * Shared entity card chrome: TraceChain + IdentityBlock + EntityStatus.
 * Entity-specific cards use this as their container, providing only
 * entity-specific body/footer content via slots.
 *
 * Slots:
 *   header           — custom card header slot
 *   title            — overrides default identity/status row
 *   subtitle         — optional subtitle row
 *   before-identity  — prefix in title row (e.g. queue number badge)
 *   default          — body content (card variant)
 *   compact-content  — extra content in compact row
 *   inline-extra     — suffix in inline row
 *   footer           — footer actions (card variant)
 */
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import EntityActionsPopover from '~/components/shared/EntityActionsPopover.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Popover from 'primevue/popover';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { ENTITY_UI } from '~/utils/status-engine';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';
import { hasMeaningfulWorkflowStatus } from '~/utils/status-actions.js';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

const props = defineProps({
    entity: { type: Object, required: true },
    entityType: { type: String, required: true },
    variant: { type: String, default: 'card' },
    surface: { type: String, default: null },
    showStatus: { type: Boolean, default: null },
    showTrace: { type: Boolean, default: null },
    expandable: { type: Boolean, default: true },
    density: { type: String, default: 'default' },
    statusActions: { type: Array, default: () => [] },
    displayExtensions: { type: Object, default: null },
    displayOverrides: { type: Object, default: null }
});

const emit = defineEmits(['refresh']);
const inlineDetailRouteRef = inject('entityInlineDetailRoute', null);
const inlineForceTraceRef = inject('entityInlineForceTrace', false);
const inlineTypeLabelRef = inject('entityInlineTypeLabel', '');
const inlineActionIdsRef = inject('entityInlineActionIds', []);
const inlineActionEntityRef = inject('entityInlineActionEntity', null);
const inlineActionEntityTypeRef = inject('entityInlineActionEntityType', '');
const inlineCanDeleteRef = inject('entityInlineCanDelete', false);
const inlineShowCassetteDesignerRef = inject('entityInlineShowCassetteDesigner', false);
const inlineExecuteActionRef = inject('entityInlineExecuteAction', null);
const statusWorkflowsRef = inject('statusWorkflows', null);

const entityConfig = computed(() => ENTITY_UI[props.entityType] || { icon: 'pi pi-box' });
const displayPlan = computed(() => resolveEntityDisplayContract({
    entityType: props.entityType,
    surface: props.surface || props.variant,
    variant: props.variant,
    extensions: props.displayExtensions,
    overrides: props.displayOverrides
}));
const effectiveShowStatus = computed(() => {
    if (!hasMeaningfulWorkflowStatus(props.entityType, unref(statusWorkflowsRef) || undefined)) return false;
    if (props.showStatus !== null) return props.showStatus;
    return displayPlan.value.surfaceContract.status === 'interactive'
        || displayPlan.value.surfaceContract.status === 'readonly';
});
const effectiveShowTrace = computed(() => {
    if (props.showTrace !== null) return props.showTrace;
    return displayPlan.value.surfaceContract.trace !== 'hidden';
});
const effectivePopupShowTrace = computed(() => effectiveShowTrace.value || Boolean(unref(inlineForceTraceRef)));
const compactDensityClass = computed(() => props.density === 'dense'
    ? '[&_.p-card-body]:!p-3 [&_.p-card-content]:!p-0'
    : ''
);
const inlineDetailRoute = computed(() => unref(inlineDetailRouteRef));
const inlineTypeLabel = computed(() => unref(inlineTypeLabelRef) || '');
const inlineActionIds = computed(() => unref(inlineActionIdsRef) || []);
const inlineActionEntity = computed(() => unref(inlineActionEntityRef) || props.entity);
const inlineActionEntityType = computed(() => unref(inlineActionEntityTypeRef) || props.entityType);
const inlineCanDelete = computed(() => Boolean(unref(inlineCanDeleteRef)));
const inlineShowCassetteDesigner = computed(() => Boolean(unref(inlineShowCassetteDesignerRef)));
const inlinePopupHasActions = computed(() => (
    inlineShowCassetteDesigner.value
    || inlineActionIds.value.length
    || inlineCanDelete.value
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
