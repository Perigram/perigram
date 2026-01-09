import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const usePenTemplatesStore = defineStore('penTemplates', () => {
    const pens = ref([]);
    const loading = ref(false);
    const error = ref(null);

    const systemPens = computed(() => pens.value.filter(p => !p.ownerId));
    const userPens = computed(() => pens.value.filter(p => p.ownerId));

    async function fetchPens() {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch('/api/templates/pens');
            pens.value = data || [];
        } catch (err) {
            error.value = err.message;
            console.error('Failed to fetch pen templates:', err);
            pens.value = [];
        } finally {
            loading.value = false;
        }
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
        createPen,
        updatePen,
        deletePen
    };
});
