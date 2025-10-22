import { computed, reactive, readonly } from 'vue';

const state = reactive({
    parts: [],
});

const getters = {
    parts: computed(() => state.parts),
};

const actions = {
    async fetchParts() {
        try {
            const parts = await $fetch('/api/parts');
            state.parts = parts;
        } catch (error) {
            console.error('Failed to fetch parts:', error);
        }
    },

    async createPart(name, svgContent) {
        try {
            const newPart = await $fetch('/api/parts', {
                method: 'POST',
                body: { name, svgContent },
            });
            state.parts.push(newPart);
        } catch (error) {
            console.error('Failed to create part:', error);
        }
    },

    async deletePart(partId) {
        try {
            await $fetch(`/api/parts/${partId}`, { method: 'DELETE' });
            state.parts = state.parts.filter(p => p._id !== partId);
        } catch (error) {
            console.error('Failed to delete part:', error);
        }
    },
};

export const partsStore = readonly({
    getters,
    actions,
});
