<template>
    <!-- Inline: pill chip with popup -->
    <template v-if="variant === 'inline'">
        <div class="inline-flex items-center gap-2 cursor-pointer" @click="togglePopup">
            <IdentityBlock :entity="entity" variant="inline" :icon="entityConfig.icon" />
            <slot name="inline-extra" />
        </div>
        
        <Popover ref="op" class="shadow-lg border border-surface-border">
            <div class="flex flex-col gap-4 p-4 min-w-[var(--ck-entity-popover-min-width)]">
                <template v-if="showTrace">
                    <div class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ $t('common.traceability') }}</small>
                        <TraceChain :entity="entity" />
                    </div>
                </template>
                <template v-if="showStatus">
                    <Divider v-if="showTrace" class="m-0" />
                    <div class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ $t('common.statusAndActions') }}</small>
                        <EntityStatus 
                            :entity="entity" 
                            :entity-type="entityType" 
                            variant="full" 
                            @transitioned="$emit('refresh')"
                        />
                    </div>
                </template>
            </div>
        </Popover>
    </template>

    <!-- Compact: identity + status in a card row -->
    <template v-else-if="variant === 'compact'">
        <Card class="h-full">
            <template #content>
            <template v-if="$slots.header">
                <slot name="header" />
            </template>
            <div class="flex items-start justify-between gap-3 min-w-0" :class="{ 'mt-2': $slots.header }">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <template v-if="$slots.title">
                        <slot name="title" />
                    </template>
                    <template v-else>
                        <slot name="before-identity" />
                        <IdentityBlock :entity="entity" variant="compact" />
                    </template>
                </div>
                <div v-if="showStatus" class="shrink-0">
                    <EntityStatus :entity="entity" :entity-type="entityType" variant="inline" />
                </div>
            </div>
            <template v-if="$slots.subtitle">
                <div class="mt-2">
                    <slot name="subtitle" />
                </div>
            </template>
            <slot name="compact-content" />
            </template>
        </Card>
    </template>

    <!-- Card: full chrome — tracechain / identity+status / body / footer -->
    <template v-else>
        <Card class="h-full">
            <template #header v-if="$slots.header">
                <slot name="header" />
            </template>
            <template #title>
                <template v-if="$slots.title">
                    <slot name="title" />
                </template>
                <template v-else>
                    <TraceChain v-if="showTrace" :entity="entity" />
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 min-w-0">
                        <div class="flex flex-col min-w-0 flex-1">
                            <slot name="before-identity" />
                            <IdentityBlock :entity="entity" />
                        </div>
                        <div v-if="showStatus" class="shrink-0 self-start">
                            <EntityStatus :entity="entity" :entity-type="entityType" variant="inline" />
                        </div>
                    </div>
                </template>
            </template>
            <template #subtitle v-if="$slots.subtitle">
                <slot name="subtitle" />
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
import Divider from 'primevue/divider';
import { ENTITY_UI } from '~/utils/status-engine';

const props = defineProps({
    entity: { type: Object, required: true },
    entityType: { type: String, required: true },
    variant: { type: String, default: 'card' },
    showStatus: { type: Boolean, default: true },
    showTrace: { type: Boolean, default: true }
});

const emit = defineEmits(['refresh']);

const entityConfig = computed(() => ENTITY_UI[props.entityType] || { icon: 'pi pi-box' });

const op = ref();
const togglePopup = (event) => {
    op.value.toggle(event);
};
</script>
