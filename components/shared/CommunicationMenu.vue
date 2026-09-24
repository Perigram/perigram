<template>
  <TieredMenu ref="menu" :model="items" popup :aria-label="$t('call.calls')" />
</template>

<script setup>
import { computed, ref } from 'vue';
import TieredMenu from 'primevue/tieredmenu';
import { useI18n } from 'vue-i18n';
import { useSupportChatStore } from '~/stores/supportChat';

/**
 * The Calls flyout: a popup TieredMenu listing every direct/group
 * conversation that can be rung. The sidebar's PanelMenu owns the
 * always-present Calls row; its command toggles this flyout anchored at
 * the row. Ongoing rooms are not listed here — they live as persistent
 * rows in the same communication panel. Conversations come from the
 * support store; the ring action is delegated through the start-call
 * event.
 */
const emit = defineEmits(['start-call']);

const menu = ref(null);
const { t } = useI18n();
const supportChatStore = useSupportChatStore();

const conversations = computed(() => supportChatStore.conversations
  .filter(conversation => conversation.conversationKind === 'direct' || conversation.conversationKind === 'group'));

const items = computed(() => {
  if (!conversations.value.length) {
    return [{ label: t('support.noConversations'), disabled: true }];
  }
  return conversations.value.map(conversation => ({
    label: conversationLabel(conversation),
    icon: conversation.conversationKind === 'group' ? 'pi pi-users' : 'pi pi-user',
    command: () => emit('start-call', conversation)
  }));
});

function conversationLabel(conversation = {}) {
  if (conversation.conversationKind === 'group') {
    return conversation.groupName || t('support.sectionGroups');
  }
  return conversation?.participant?.identity?.name
    || conversation?.participant?.name
    || t('common.user');
}

defineExpose({
  toggle: event => menu.value?.toggle(event)
});
</script>
