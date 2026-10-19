<template>
  <Button
    v-if="instanceId"
    icon="pi pi-comments"
    text
    rounded
    severity="secondary"
    :size="size"
    :aria-label="$t('support.instanceChat')"
    :title="$t('support.instanceChat')"
    @click="openInstanceChat({ type: typeId, id: instanceId, name })"
  />
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { openInstanceChat } from '~/utils/instance-chat.js';

// The composed instance-chat entry: the one conversation affordance for
// instance surfaces (record headers, card footers, pane strips). The
// thread kind follows the support conversation contract at the seam
// itself (a user-typed record opens the direct thread). Callers pass the
// record's resolved display name (the one title resolver).
const props = defineProps({
  typeId: { type: String, required: true },
  instance: { type: Object, required: true },
  name: { type: String, default: '' },
  size: { type: String, default: 'small' }
});

const instanceId = computed(() => {
  const id = props.instance?._id ?? props.instance?.id;
  return id ? String(id) : '';
});
</script>
