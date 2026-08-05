<script setup>
/**
 * EntityPage - v24 Absolute Final
 * Standardized layout for entity detail pages.
 */
import IdentityBlock from './blocks/IdentityBlock.vue';
import EntityStatus from './status/EntityStatus.vue';
import TraceChain from './links/TraceChain.vue';
import EntityActionsPopover from './EntityActionsPopover.vue';
import Divider from 'primevue/divider';
import { computed } from 'vue';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true },
  title: { type: String, default: null },
  loading: { type: Boolean, default: false },
  showTrace: { type: Boolean, default: false },
  showHeader: { type: Boolean, default: true },
  showIdentity: { type: Boolean, default: true },
  showStatus: { type: Boolean, default: true },
  statusActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh']);
const effectiveTitle = computed(() => props.title || '');
</script>

<template>
  <div class="entity-page flex flex-col gap-6">
    <div v-if="showHeader" class="flex flex-col gap-4" data-entity-page-header>
      <TraceChain v-if="showTrace" :entity="entity" :entity-type="entityType" />

      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex min-w-0 flex-col gap-2">
          <div v-if="effectiveTitle" class="text-sm text-muted-color">
            {{ effectiveTitle }}
          </div>
          <IdentityBlock v-if="showIdentity" :entity="entity" variant="header" />
          <div v-if="$slots.info" class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-color">
            <slot name="info"></slot>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <EntityStatus
            v-if="showStatus"
            :entity="entity"
            :entity-type="entityType"
            variant="inline"
            :actions="statusActions"
            @refresh="$emit('refresh')"
            @transitioned="$emit('refresh')"
          />
          <EntityActionsPopover v-if="$slots.actions">
            <slot name="actions"></slot>
          </EntityActionsPopover>
        </div>
      </div>
    </div>

    <Divider v-if="showHeader" class="m-0" />

    <div :class="[ $slots.sidebar ? 'grid grid-cols-1 lg:grid-cols-12 gap-6' : 'flex flex-col gap-6' ]">
      <div :class="[ $slots.sidebar ? 'lg:col-span-8 flex flex-col gap-6' : 'flex flex-col gap-6' ]">
        <slot></slot>
      </div>

      <div v-if="$slots.sidebar" class="lg:col-span-4 flex flex-col gap-6">
        <slot name="sidebar"></slot>
      </div>
    </div>
  </div>
</template>
