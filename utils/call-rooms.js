/**
 * Shared call-room mapping helpers. Room names are derived on the server
 * (`server/features/livekit/service.js`); these helpers mirror that contract
 * for the frontend so the sidebar, chat, and notification surfaces agree on
 * which conversation a room belongs to.
 */

export function conversationKeyForRoom(room = '') {
    if (room.startsWith('call:group:')) return `group:${room.slice('call:group:'.length)}`;
    if (room.startsWith('call:direct:')) return room.slice('call:'.length);
    return '';
}

export function roomForConversationKey(conversationKey = '', userId = '') {
    if (conversationKey.startsWith('group:')) {
        return `call:group:${conversationKey.slice('group:'.length)}`;
    }
    if (conversationKey.startsWith('direct:')) {
        const ids = conversationKey.split(':').slice(1).map(String);
        if (!ids.includes(String(userId))) return '';
        return `call:direct:${[...ids].sort().join(':')}`;
    }
    return '';
}

export function otherDirectParticipantId(room = '', userId = '') {
    if (!room.startsWith('call:direct:')) return '';
    return room.split(':').slice(2).find(id => id !== String(userId)) || '';
}

/**
 * Display label for an active call room, resolved against the loaded
 * conversation summaries. Group rooms take the group name, direct rooms the
 * other participant's name, and org rooms the organization name.
 */
export function callRoomLabel(room = '', conversations = [], { userId = '', orgName = '', fallback = '' } = {}) {
    if (room.startsWith('call:group:')) {
        const key = `group:${room.slice('call:group:'.length)}`;
        const conversation = conversations.find(item => item.conversationKey === key);
        return conversation?.groupName || fallback;
    }
    if (room.startsWith('call:direct:')) {
        const otherId = otherDirectParticipantId(room, userId);
        const conversation = conversations.find(item => (
            item.conversationKind === 'direct'
            && (item.participants || []).map(String).includes(otherId)
        ));
        return conversation?.participant?.identity?.name
            || conversation?.participant?.name
            || fallback;
    }
    if (room.startsWith('call:org:')) return orgName || fallback;
    return fallback;
}

export function callRoomIcon(kind = '') {
    if (kind === 'group') return 'pi pi-users';
    if (kind === 'direct') return 'pi pi-user';
    return 'pi pi-volume-up';
}
