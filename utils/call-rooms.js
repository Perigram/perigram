/**
 * Display helpers for active call rooms: the label resolved against the
 * loaded conversation summaries and the room-kind icon. The room-name
 * grammar and room↔conversation mapping live in `#shared/call-rooms.js`.
 */
import { conversationKeyForRoom, otherDirectParticipantId } from '#shared/call-rooms.js';

/**
 * Display label for an active call room, resolved against the loaded
 * conversation summaries. Group rooms take the group name, direct rooms the
 * other participant's name, and org rooms the organization name.
 */
export function callRoomLabel(room = '', conversations = [], { userId = '', orgName = '', fallback = '' } = {}) {
    if (room.startsWith('call:group:')) {
        const conversation = conversations.find(item => item.conversationKey === conversationKeyForRoom(room));
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
