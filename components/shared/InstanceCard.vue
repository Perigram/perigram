<template>
    <!-- Inline: pill chip; the click opens the shared record popup -->
    <template v-if="variant === 'inline'">
        <span
            class="inline-flex min-w-0 max-w-full items-center gap-2 align-baseline"
            :class="{ 'cursor-pointer': popupOpenable }"
            :role="popupOpenable ? 'button' : undefined"
            :tabindex="popupOpenable ? 0 : undefined"
            data-instance-card-interactive="true"
            @click="openPopup"
            @keydown="onToggleKeydown"
        >
            <Chip
                :label="identityLabel"
                :icon="instanceConfig.icon || undefined"
                :pt="CHIP_LABEL_PT"
                :class="[INSTANCE_CHIP_CLASS, 'min-w-0 max-w-full']"
                :title="identityLabel"
            />
            <slot name="inline-extra" />
        </span>
    </template>

    <!-- Compact: identity + status in a card row -->
    <template v-else-if="variant === 'compact'">
        <Card
            class="h-full overflow-hidden"
            :class="{ 'cursor-pointer': popupOpenable }"
            :role="popupOpenable ? 'button' : undefined"
            :tabindex="popupOpenable ? 0 : undefined"
            data-instance-card-interactive="true"
            @click="openPopup"
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
                    <TraceChain v-if="effectiveShowTrace" :entity="instance" :type-id="typeId" :exclude="traceExclusions" class="mb-2" />
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
                  <InstanceChatEntry :type-id="typeId" :instance="instance" :name="identityLabel" />
                  <InstanceActionsPopover v-if="footerDisplay === 'menu' && $slots.footer">
                    <slot name="footer" />
                  </InstanceActionsPopover>
                  <slot v-else name="footer" />
                </div>
            </template>
        </Card>
    </template>
</template>

<script setup>
import { computed, useSlots } from 'vue';
/**
 * InstanceCard - v24 Standardized
 * Shared instance card structure: TraceChain + identity chrome + InstanceState.
 * Entity-specific cards use this as their container, providing only
 * instance-specific body/footer content via slots.
 *
 * Slot support is a per-variant contract (shared/README.md → InstanceCard):
 *   inline  — inline-extra
 *   compact — header, title, before-identity, subtitle, compact-content
 *   card    — header, title, before-identity, subtitle, default, footer
 * Supplying a slot outside its variant warns in development.
 */
import InstanceState from '~/components/shared/state/InstanceState.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import InstanceActionsPopover from '~/components/shared/InstanceActionsPopover.vue';
import Card from 'primevue/card';
import Chip from 'primevue/chip';
import { CHIP_LABEL_PT, INSTANCE_CHIP_CLASS } from './chip-surface.js';
import { useRegistryStore } from '~/stores/registry';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { useI18n } from 'vue-i18n';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { instanceHierarchyIds } from '~/utils/instance-hierarchy.js';
import InstanceChatEntry from '~/components/shared/InstanceChatEntry.vue';
import { useEntityPopup } from '~/composables/useEntityPopup';

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
    displayOverrides: { type: Object, default: null },
    contextInstance: { type: Object, default: null },
    contextTypeId: { type: String, default: '' },
    footerDisplay: { type: String, default: 'inline', validator: value => ['menu', 'inline'].includes(value) }
});

const emit = defineEmits(['refresh']);

const slots = useSlots();
const SUPPORTED_SLOTS = Object.freeze({
    inline: Object.freeze(['inline-extra']),
    compact: Object.freeze(['header', 'title', 'before-identity', 'subtitle', 'compact-content']),
    card: Object.freeze(['header', 'title', 'before-identity', 'subtitle', 'default', 'footer'])
});
if (import.meta.env.DEV) {
    const supported = SUPPORTED_SLOTS[props.variant] || SUPPORTED_SLOTS.card;
    for (const name of Object.keys(slots)) {
        if (!supported.includes(name)) {
            console.warn(`[InstanceCard] "${name}" slot is unsupported in variant "${props.variant}"`);
        }
    }
}

const cardInstanceId = computed(() => {
    const id = props.instance?._id ?? props.instance?.id;
    return id ? String(id) : '';
});

const { t } = useI18n();
const registry = useRegistryStore();
// Render-policy icons are the single icon source.
const instanceConfig = computed(() => ({ icon: registry.iconFor(props.typeId) }));
const displayPlan = computed(() => resolveInstanceDisplayContract({
    typeId: props.typeId,
    surface: props.surface || props.variant,
    variant: props.variant,
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

// The inline/compact expansion is the shared entity popup: the record's
// compiled detail surface in the standard dialog. A type with no record
// surface (the popup composable's openable law) renders an inert chip.
const { open: openEntityPopup, openable: entityPopupOpenable } = useEntityPopup();
const popupOpenable = computed(() => props.expandable
    && Boolean(cardInstanceId.value)
    && entityPopupOpenable(props.typeId));

function openPopup(event) {
    if (!popupOpenable.value) return;
    if (isInteractiveEventTarget(event)) return;
    openEntityPopup({ typeId: props.typeId, instanceId: cardInstanceId.value });
}

const onToggleKeydown = (event) => {
    if (!popupOpenable.value || isInteractiveEventTarget(event)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPopup(event);
};
</script>
