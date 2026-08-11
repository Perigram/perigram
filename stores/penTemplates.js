import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from '~/stores/auth';

const ownerId = (pen) => pen?.lineage?.userId || pen?.ownerId || null;

export const usePenTemplatesStore = defineStore('penTemplates', () => {
    const authStore = useAuthStore();
    const pens = ref([]);
    const loading = ref(false);
    const error = ref(null);
    const pendingFetches = new Map();
    let loadedScope = null;

    const currentScope = () => {
        const user = authStore.userData || {};
        const userId = user.userId || user.id || 'anonymous';
        const organizationId = user.organizationId || authStore.organizationData?._id || 'none';
        return `${userId}:${organizationId}`;
    };

    const systemPens = computed(() => pens.value.filter(p => !ownerId(p)));
    const userPens = computed(() => pens.value.filter(p => ownerId(p)));

    async function fetchPens() {
        const scope = currentScope();
        if (pendingFetches.has(scope)) return pendingFetches.get(scope);

        loading.value = true;
        error.value = null;
        const request = (async () => {
            try {
                const data = await $fetch('/api/templates/pens');
                if (currentScope() === scope) {
                    pens.value = data || [];
                    loadedScope = scope;
                }
                return data || [];
            } catch (err) {
                if (currentScope() === scope) {
                    error.value = err.message;
                    pens.value = [];
                    loadedScope = null;
                }
                console.error('Failed to fetch pen templates:', err);
            } finally {
                pendingFetches.delete(scope);
                loading.value = pendingFetches.size > 0;
            }
        })();

        pendingFetches.set(scope, request);
        return request;
    }

    async function ensurePens() {
        const scope = currentScope();
        if (loadedScope === scope) return pens.value;
        if (loadedScope !== null) pens.value = [];
        return fetchPens();
    }

    async function createPen(penData) {
        try {
            const pen = await $fetch('/api/templates/pens', {
                method: 'POST',
                body: penData
            });
            pens.value.push(pen);
            return pen;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function updatePen(id, updates) {
        try {
            const pen = await $fetch(`/api/templates/pens/${id}`, {
                method: 'PUT',
                body: updates
            });
            const index = pens.value.findIndex(p => p._id === id);
            if (index !== -1) {
                pens.value[index] = pen;
            }
            return pen;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deletePen(id) {
        try {
            await $fetch(`/api/templates/pens/${id}`, {
                method: 'DELETE'
            });
            pens.value = pens.value.filter(p => p._id !== id);
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    return {
        pens,
        loading,
        error,
        systemPens,
        userPens,
        fetchPens,
        ensurePens,
        createPen,
        updatePen,
        deletePen
    };
});
