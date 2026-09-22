<template>
  <TieredMenu :model="items" class="w-full !border-none !bg-transparent !p-0" :aria-label="$t('support.chatTitle')" />
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import TieredMenu from 'primevue/tieredmenu';
import { useI18n } from 'vue-i18n';
import { useSupportChatStore } from '~/stores/supportChat';

/**
 * The sidebar communication menu: Chats, Knowledge, and Calls as proper
 * PrimeVue TieredMenu items. The Calls submenu lists every direct/group
 * conversation and rings it. Knowledge opens the org-wide OpenKnowledge
 * editor through its authenticated proxy, and only appears for users the
 * knowledge service admits. Ongoing rooms are NOT listed here — they live
 * as persistent sidebar rows (see the generated home workspace sidebar) and
 * brand-new invites float through the global IncomingCalls surface. Data
 * comes from the auth/support stores; actions are delegated through events.
 */
const emit = defineEmits(['open-chats', 'start-call']);

const { t } = useI18n();
const supportChatStore = useSupportChatStore();

const knowledgeAdmitted = ref(false);
onMounted(async () => {
    try {
        const info = await $fetch('/api/knowledge/info');
        knowledgeAdmitted.value = Boolean(info?.admitted);
    } catch {
        /* the entry stays hidden when admission cannot be resolved */
    }
});

const conversations = computed(() => supportChatStore.conversations
  .filter(conversation => conversation.conversationKind === 'direct' || conversation.conversationKind === 'group'));

const unreadCount = computed(() => Number(supportChatStore.totalUnread || 0));

const items = computed(() => [
  {
    label: t('support.chatTitle'),
    icon: 'pi pi-comments',
    ...(unreadCount.value ? { badge: String(unreadCount.value), badgeSeverity: 'danger' } : {}),
    command: () => emit('open-chats')
  },
  ...(knowledgeAdmitted.value
    ? [{
        label: t('knowledge.title'),
        icon: 'pi pi-book',
        command: () => window.open('/api/knowledge/proxy/', '_blank')
      }]
    : []),
  {
    label: t('call.calls'),
    icon: 'pi pi-phone',
    items: callItems.value
  }
]);

const callItems = computed(() => {
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
</script>
