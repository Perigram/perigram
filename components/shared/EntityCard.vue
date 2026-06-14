<template>
    <!-- Inline: pill chip with popup -->
    <template v-if="variant === 'inline'">
        <div
            class="inline-flex items-center gap-2"
            :class="{ 'cursor-pointer': expandable }"
            :role="expandable ? 'button' : undefined"
            :tabindex="expandable ? 0 : undefined"
            data-entity-card-interactive="true"
            @click="togglePopup"
            @keydown="onToggleKeydown"
        >
            <IdentityBlock :entity="entity" variant="inline" :icon="entityConfig.icon" />
            <slot name="inline-extra" />
        </div>
        
        <Popover ref="op" class="[box-shadow:var(--ck-shadow-overlay)] border border-content-border">
            <div class="w-[min(34rem,calc(100vw-3rem))]">
                <div class="flex flex-col gap-4 p-4">
                    <TraceChain v-if="showTrace" :entity="entity" />
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <IdentityBlock :entity="entity" />
                        <EntityStatus
                            v-if="showStatus"
                            :entity="entity"
                            :entity-type="entityType"
                            variant="inline"
                            :actions="statusActions"
                            @transitioned="$emit('refresh')"
                        />
                    </div>
                    <slot name="expanded">
                        <slot />
                    </slot>
                    <slot name="footer" />
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
                <div v-if="showStatus" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
                    <EntityStatus
                        :entity="entity"
                        :entity-type="entityType"
                        variant="inline"
                        :actions="statusActions"
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
                    <TraceChain v-if="showTrace" :entity="entity" />
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <IdentityBlock :entity="entity" />
                        <EntityStatus
                            v-if="showStatus"
                            :entity="entity"
                            :entity-type="entityType"
                            variant="inline"
                            :actions="statusActions"
                            @transitioned="$emit('refresh')"
                        />
                    </div>
                    <slot name="expanded">
                        <slot />
                    </slot>
                    <slot name="footer" />
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
                    <TraceChain v-if="showTrace" :entity="entity" class="mb-2" />
                    <div class="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-start gap-3 min-w-0">
                        <div class="flex min-w-0 flex-1 items-start gap-2">
                            <slot name="before-identity" />
                            <IdentityBlock :entity="entity" />
                        </div>
                        <div v-if="showStatus" class="min-w-0 max-w-full shrink self-start sm:max-w-56" @click.stop>
                            <EntityStatus
                                :entity="entity"
                                :entity-type="entityType"
                                variant="inline"
                                :actions="statusActions"
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
                <slot name="footer" />
            </template>
        </Card>
    </template>
</template>

<script setup>
import { computed, ref } from 'vue';
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
import Card from 'primevue/card';
import Popover from 'primevue/popover';
import { ENTITY_UI } from '~/utils/status-engine';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const props = defineProps({
    entity: { type: Object, required: true },
    entityType: { type: String, required: true },
    variant: { type: String, default: 'card' },
    showStatus: { type: Boolean, default: true },
    showTrace: { type: Boolean, default: true },
    expandable: { type: Boolean, default: true },
    density: { type: String, default: 'default' },
    statusActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh']);

const entityConfig = computed(() => ENTITY_UI[props.entityType] || { icon: 'pi pi-box' });
const compactDensityClass = computed(() => props.density === 'dense'
    ? '[&_.p-card-body]:!p-3 [&_.p-card-content]:!p-0'
    : ''
);

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

</script>
