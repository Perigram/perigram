<template>
  <TieredMenu :model="items" class="w-full border-none bg-transparent !p-0" :aria-label="$t('support.chatTitle')" />
</template>

<script setup>
import { computed } from 'vue';
import TieredMenu from 'primevue/tieredmenu';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useSupportChatStore } from '~/stores/supportChat';

/**
 * The sidebar communication menu: Chats and Calls as proper PrimeVue
 * TieredMenu items. The Calls submenu lists every direct/group
 * conversation (choosing one rings it) and, below a separator, every
 * currently joinable call room with its participant count. Data comes from
 * the auth/support stores plus the livekit active-room snapshot the host
 * polls; actions are delegated through events.
 */
const props = defineProps({
  activeRooms: { type: Array, default: () => [] }
});

const emit = defineEmits(['open-chats', 'start-call', 'join-room']);

const { t } = useI18n();
const authStore = useAuthStore();
const supportChatStore = useSupportChatStore();

const currentUserId = computed(() => String(
  authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id || ''
));

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
  {
    label: t('call.calls'),
    icon: 'pi pi-phone',
    items: callItems.value
  }
]);

const callItems = computed(() => {
  const entries = [
    { label: t('call.newCall'), disabled: true },
    ...(conversations.value.length
      ? conversations.value.map(conversation => ({
        label: conversationLabel(conversation),
        icon: conversation.conversationKind === 'group' ? 'pi pi-users' : 'pi pi-user',
        command: () => emit('start-call', conversation)
      }))
      : [{ label: t('support.noConversations'), disabled: true }])
  ];
  if (!props.activeRooms.length) return entries;
  return [
    ...entries,
    { separator: true },
    { label: t('call.activeRooms'), disabled: true },
    ...props.activeRooms.map(room => ({
      label: roomLabel(room),
      icon: roomIcon(room.kind),
      badge: String(room.participants || 0),
      command: () => emit('join-room', room)
    }))
  ];
});

function conversationLabel(conversation = {}) {
  if (conversation.conversationKind === 'group') {
    return conversation.groupName || t('support.sectionGroups');
  }
  return conversation?.participant?.identity?.name
    || conversation?.participant?.name
    || t('common.user');
}

function roomLabel(room = {}) {
  if (room.kind === 'group') {
    const conversation = supportChatStore.conversations.find(item => (
      item.conversationKind === 'group'
      && item.conversationKey === `group:${room.room.slice('call:group:'.length)}`
    ));
    return conversation?.groupName || t('call.groupCall');
  }
  if (room.kind === 'direct') {
    const otherId = room.room.split(':').slice(2).find(id => id !== currentUserId.value);
    const conversation = supportChatStore.conversations.find(item => (
      item.conversationKind === 'direct'
      && (item.participants || []).map(String).includes(String(otherId))
    ));
    return conversation?.participant?.identity?.name || t('call.directCall');
  }
  return orgLabel.value;
}

function roomIcon(kind = '') {
  if (kind === 'group') return 'pi pi-users';
  if (kind === 'direct') return 'pi pi-user';
  return 'pi pi-volume-up';
}

const orgLabel = computed(() => (
  authStore.organizationData?.identity?.name
  || authStore.organizationData?.data?.name
  || t('call.orgChannel')
));
</script>
