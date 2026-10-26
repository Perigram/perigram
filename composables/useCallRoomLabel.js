import { useAuthStore } from '~/stores/auth';
import { useSupportChatStore } from '~/stores/supportChat';
import { callRoomLabel } from '~/utils/call-rooms.js';

// The one call-room label resolver for call surfaces: the room's
// conversation name over the loaded conversation summaries, with the
// viewer id and active organization name from the auth store. Callers
// pass their localized fallback.
export function useCallRoomLabel() {
    const authStore = useAuthStore();
    const supportChatStore = useSupportChatStore();
    return (room = '', fallback = '') => callRoomLabel(room, supportChatStore.conversations, {
        userId: authStore.userData?.id,
        orgName: authStore.organizationData?.identity?.name || undefined,
        fallback
    });
}
