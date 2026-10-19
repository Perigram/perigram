import { useAuthStore } from '~/stores/auth';
import { useFileTypeView } from '~/composables/useFileTypeView';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';

const KEY = 'entityPopup';
const DIRECTORY_TYPES = ['user', 'organization'];

// A type is popup-openable exactly when a surface exists to render: the
// directory profile for user/organization, a compiled/synthesizable
// detail screen, or the record floor over the served type view. A type
// absent from the served view has no record surface anywhere (panes stay
// silent for it too) — callers render no interactive link and open()
// refuses.
export function useEntityPopup() {
    const request = useState(KEY, () => null);
    const authStore = useAuthStore();
    const { typeById } = useFileTypeView();

    function openable(typeId = '') {
        if (!typeId) return false;
        if (DIRECTORY_TYPES.includes(typeId)) return true;
        if (resolveDetailScreen({
            screens: authStore.screenManifest || [],
            typeId
        })) return true;
        return Boolean(typeById(typeId));
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
