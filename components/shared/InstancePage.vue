<script setup>
/**
 * InstancePage - v24
 * Standardized layout for entity detail pages.
 */
import IdentityBlock from './blocks/IdentityBlock.vue';
import InstanceState from './state/InstanceState.vue';
import TraceChain from './links/TraceChain.vue';
import InstanceActionsPopover from './InstanceActionsPopover.vue';
import { computed, inject, provide, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { useRegistryStore } from '~/stores/registry';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  title: { type: String, default: null },
  loading: { type: Boolean, default: false },
  showTrace: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: true },
  showIdentity: { type: Boolean, default: true },
  showStatus: { type: Boolean, default: true },
  showTypeLabel: { type: Boolean, default: true },
  traceExclusions: { type: Array, default: () => [] },
  actionsDisplay: { type: String, default: 'inline', validator: value => ['menu', 'inline'].includes(value) },
  stateActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh']);
const { t, te } = useI18n();
const effectiveTitle = computed(() => props.title || '');
const typeLabel = computed(() => {
  const contract = DESIGN_SYSTEM_ENTITY_CONTRACTS.find(entry => entry.key === props.typeId || entry.typeId === props.typeId);
  const key = contract?.labelKey;
  if (!key || !te?.(key)) return '';
  const label = t(key);
  return typeof label === 'string' ? label : '';
});
const registry = useRegistryStore();
const entityIcon = computed(() => registry.iconFor(props.typeId));
const parentDisplayedEntityContexts = inject('displayedEntityContexts', computed(() => []));
provide('displayedEntityContexts', computed(() => [
  ...(unref(parentDisplayedEntityContexts) || []),
  { type: props.typeId, entity: props.entity }
]));
</script>

<template>
  <div class="entity-page flex w-full min-w-0 flex-col gap-6">
    <div v-if="showHeader" class="flex flex-col gap-3 border-b border-content-border pb-5" data-entity-page-header>
      <TraceChain v-if="showTrace" :entity="entity" :type-id="typeId" :exclude="traceExclusions" />

      <div class="entity-page-header-content flex flex-col gap-3">
        <div class="flex min-w-0 flex-col gap-1">
          <small v-if="showTypeLabel && typeLabel" class="uppercase text-muted text-supporting">
            {{ typeLabel }}
          </small>
          <div v-if="effectiveTitle" class="text-muted text-body">
            {{ effectiveTitle }}
          </div>
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <IdentityBlock v-if="showIdentity" :entity="entity" variant="header" :icon="entityIcon" />
            <InstanceState
              v-if="showStatus"
              :entity="entity"
              :type-id="typeId"
              variant="inline"
              :actions="stateActions"
              @refresh="$emit('refresh')"
              @transitioned="$emit('refresh')"
            />
          </div>
          <div v-if="$slots.info" class="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted text-body">
            <slot name="info"></slot>
          </div>
        </div>

        <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
          <template v-if="actionsDisplay === 'inline'">
            <slot name="actions"></slot>
          </template>
          <InstanceActionsPopover v-else>
            <slot name="actions"></slot>
          </InstanceActionsPopover>
        </div>
      </div>
    </div>

    <div :class="[ $slots.sidebar ? 'entity-page-content-grid grid grid-cols-1 gap-6' : 'flex flex-col gap-6' ]">
      <div :class="[ $slots.sidebar ? 'entity-page-main flex min-w-0 flex-col gap-6' : 'flex min-w-0 flex-col gap-6' ]">
        <slot></slot>
      </div>

      <div v-if="$slots.sidebar" class="entity-page-sidebar flex min-w-0 flex-col gap-6">
        <slot name="sidebar"></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entity-page {
  container-type: inline-size;
}

@container (min-width: 32rem) {
  .entity-page-header-content {
    align-items: flex-start;
    flex-direction: row;
    justify-content: space-between;
  }
}

@container (min-width: 48rem) {
  .entity-page-content-grid {
    grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
  }
}
</style>
