import { describe, expect, it } from 'vitest';
import { callRoomLabel } from './call-rooms.js';
import {
    conversationKeyForRoom,
    otherDirectParticipantId,
    roomForConversationKey
} from '#shared/call-rooms.js';

describe('call room mapping', () => {
    it('maps rooms to conversation keys', () => {
        expect(conversationKeyForRoom('call:group:g1')).toBe('group:g1');
        expect(conversationKeyForRoom('call:direct:u1:u2')).toBe('direct:u1:u2');
        expect(conversationKeyForRoom('call:org:org1')).toBe('');
        expect(conversationKeyForRoom('')).toBe('');
    });

    it('maps conversation keys back to rooms, sorted like the server', () => {
        expect(roomForConversationKey('group:g1', 'u2')).toBe('call:group:g1');
        expect(roomForConversationKey('direct:u2:u1', 'u1')).toBe('call:direct:u1:u2');
        // conversations the user is not part of have no room
        expect(roomForConversationKey('direct:u3:u4', 'u1')).toBe('');
        expect(roomForConversationKey('support:x', 'u1')).toBe('');
    });

    it('resolves the other direct participant', () => {
        expect(otherDirectParticipantId('call:direct:u1:u2', 'u1')).toBe('u2');
        expect(otherDirectParticipantId('call:org:org1', 'u1')).toBe('');
    });

    it('labels rooms from loaded conversations', () => {
        const conversations = [
            { conversationKey: 'group:g1', groupName: 'Ops', participants: [] },
            { conversationKind: 'direct', participants: ['u1', 'u2'], participant: { identity: { name: 'Roma' } } }
        ];
        expect(callRoomLabel('call:group:g1', conversations, {})).toBe('Ops');
        expect(callRoomLabel('call:direct:u1:u2', conversations, { userId: 'u1' })).toBe('Roma');
        expect(callRoomLabel('call:direct:u1:u9', conversations, { userId: 'u1', fallback: 'Direct call' })).toBe('Direct call');
        expect(callRoomLabel('call:org:org1', [], { orgName: 'Soda', fallback: 'x' })).toBe('Soda');
    });
});
