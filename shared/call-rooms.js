/**
 * The call-room name grammar — one home for the livekit feature (room
 * minting and admission) and the client call surfaces (room ↔
 * conversation mapping): `call:direct:<sorted user ids>`,
 * `call:group:<groupId>`, `call:org:<orgId>`.
 */

const sortedDirectIds = (left, right) => [String(left), String(right)].sort();

export const directCallRoom = (left, right) => `call:direct:${sortedDirectIds(left, right).join(':')}`;

export const orgCallRoom = (orgId) => `call:org:${orgId}`;

export const groupCallRoom = (groupId) => `call:group:${groupId}`;

export function conversationKeyForRoom(room = '') {
    if (room.startsWith('call:group:')) return `group:${room.slice('call:group:'.length)}`;
    if (room.startsWith('call:direct:')) return room.slice('call:'.length);
    return '';
}

export function roomForConversationKey(conversationKey = '', userId = '') {
    if (conversationKey.startsWith('group:')) {
        return groupCallRoom(conversationKey.slice('group:'.length));
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
