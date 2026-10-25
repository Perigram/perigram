import { useAuthStore } from '~/stores/auth';
import { useFileTypeView } from '~/composables/useFileTypeView';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';

const KEY = 'entityPopup';
const DIRECTORY_TYPES = ['user', 'organization'];

// Popup-openable law: composables/README.md → useEntityPopup.
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
            // The served type record's id is the pool key and the manifest
            // vocabulary — refs may carry aliases.
            const servedTypeId = typeById(typeId)?.id || String(typeId);
            request.value = { typeId: servedTypeId, instanceId: String(instanceId) };
        },
        close() {
            request.value = null;
        }
    };
}
