<template>
  <div :class="LAYOUT.stack" data-testid="group-collection">
    <section v-for="group in instances" :key="group.id" :class="LAYOUT.stackTight">
      <!-- A group instance renders as a group (SPEC §22.11): its
           identifier heads a section, its members ride beneath — flat,
           one level. The overflow opens the group's own record, where
           the children arrange through the record ladder. -->
      <div :class="LAYOUT.rowBetween">
        <InstanceIdentity
          :instance="group"
          :type="type"
          :openable="openable"
          @open="target => $emit('open', target)"
        />
        <Tag v-if="childrenOf(group).length" :value="String(childrenOf(group).length)" severity="secondary" />
      </div>
      <div :class="LAYOUT.stackTight">
        <InstanceIdentity
          v-for="child in visibleChildrenOf(group)"
          :key="`${child.type}:${child.id}`"
          :instance="child"
          :type="typeOf(child)"
          size="small"
          :openable="openable"
          @open="target => $emit('open', target)"
        />
      </div>
      <Button
        v-if="childrenOf(group).length > memberBudget"
        :label="$t('uiMapping.showMore', { count: childrenOf(group).length - memberBudget })"
        link
        size="small"
        severity="secondary"
        @click="openRecord(group)"
      />
    </section>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { LAYOUT, childrenOfParent } from '#shared/ui-mapping/index.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import InstanceIdentity from './InstanceIdentity.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  // The overlaid pool: child types load lazily through the region host's
  // loadType seam, and members resolve over what arrived.
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const emit = defineEmits(['open']);

const memberBudget = 6;
const childrenOf = group => childrenOfParent(props.type, props.pool, group.id);
const visibleChildrenOf = group => childrenOf(group).slice(0, memberBudget);
const typeOf = child => (props.bundle?.types || []).find(entry => entry.id === child.type)
  || { id: child.type, fields: {} };

// The overflow opens the group's record popup — the record surface
// arranges the full membership; the screen's open channel is the
// fallback.
const { open: openEntityPopup, openable: popupOpenable } = useEntityPopup();
function openRecord(group) {
  const typeId = String(props.type?.id || '');
  if (typeId && popupOpenable(typeId)) {
    openEntityPopup({ typeId, instanceId: String(group.id) });
    return;
  }
  emit('open', group);
}
</script>
