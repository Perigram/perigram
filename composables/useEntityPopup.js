const KEY = 'entityPopup';

export function useEntityPopup() {
    const request = useState(KEY, () => null);
    return {
        request,
        open({ typeId = '', instanceId = '' } = {}) {
            if (!typeId || !instanceId) return;
            request.value = { typeId: String(typeId), instanceId: String(instanceId) };
        },
        close() {
            request.value = null;
        }
    };
}
