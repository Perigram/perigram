import { useAuthStore } from '~/stores/auth';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';

const KEY = 'entityPopup';
const DIRECTORY_TYPES = ['user', 'organization'];

// A type is popup-openable exactly when a surface exists to render: the
// directory profile for user/organization, or a compiled/synthesizable
// detail screen from the user's manifest. Anything else has no record
// surface anywhere (panes stay silent for it too) — a popup for it would
// be an empty shell with dead chrome, so callers render no interactive
// link and open() refuses.
export function useEntityPopup() {
    const request = useState(KEY, () => null);
    const authStore = useAuthStore();

    function openable(typeId = '') {
        if (!typeId) return false;
        if (DIRECTORY_TYPES.includes(typeId)) return true;
        return Boolean(resolveDetailScreen({
            screens: authStore.screenManifest || [],
            typeId
        }));
    }

    return {
        request,
        openable,
        open({ typeId = '', instanceId = '' } = {}) {
            if (!typeId || !instanceId || !openable(typeId)) return;
            request.value = { typeId: String(typeId), instanceId: String(instanceId) };
        },
        close() {
            request.value = null;
        }
    };
}
