import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePartsStore = defineStore('parts', () => {
    const parts = ref([]);

    async function fetchParts() {
        try {
            const data = await $fetch('/api/parts');
            parts.value = data;
        } catch (error) {
            console.error('Failed to fetch parts:', error);
        }
    }

    async function createPart(name, svgContent) {
        try {
            const newPart = await $fetch('/api/parts', {
                method: 'POST',
                body: { name, svgContent },
            });
            parts.value.push(newPart);
        } catch (error) {
            console.error('Failed to create part:', error);
        }
    }

    async function deletePart(partId) {
        try {
            await $fetch(`/api/parts/${partId}`, { method: 'DELETE' });
            parts.value = parts.value.filter(p => p._id !== partId);
        } catch (error) {
            console.error('Failed to delete part:', error);
        }
    }

    return {
        parts,
        fetchParts,
        createPart,
        deletePart
    };
});
