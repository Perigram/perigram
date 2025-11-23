import { computed, reactive, readonly } from 'vue';

const state = reactive({
    cassettes: [],
    selectedCassetteId: null,
    uploadStatus: 'idle', // idle, uploading, mapping, processing, error
    uploadProgress: 0,
    detectedLayers: [],
    layerMapping: {
        cut: [],
        bend: [],
        frame: [],
        dimensions: []
    }
});

const getters = {
    cassettes: computed(() => {
        const result = Array.isArray(state.cassettes) ? state.cassettes : [];
        console.log('[cassettes.js getter] Returning cassettes:', result.length);
        return result;
    }),
    allCassettes: computed(() => {
        const result = Array.isArray(state.cassettes) ? state.cassettes : [];
        console.log('[cassettes.js getter] Returning allCassettes:', result.length);
        return result;
    }),
    selectedCassette: computed(() => state.cassettes.find(c => c._id === state.selectedCassetteId)),
    uploadStatus: computed(() => state.uploadStatus),
    detectedLayers: computed(() => state.detectedLayers),
    layerMapping: computed(() => state.layerMapping)
};

const actions = {
    async fetchCassettes() {
        try {
            console.log('[cassettes.js] Fetching cassettes from API...');
            const cassettes = await $fetch('/api/cassettes');
            console.log('[cassettes.js] API returned:', cassettes);
            state.cassettes = Array.isArray(cassettes) ? cassettes : [];
            console.log('[cassettes.js] State updated:', state.cassettes);
        } catch (error) {
            console.error('Failed to fetch cassettes:', error);
            state.cassettes = [];
        }
    },

    async fetchById(id) {
        try {
            const cassette = await $fetch(`/api/cassettes/${id}`);
            return cassette;
        } catch (error) {
            console.error('Failed to fetch cassette:', error);
            throw error;
        }
    },

    async uploadCassette(file, name, layerMapping) {
        state.uploadStatus = 'uploading';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        if (layerMapping) {
            formData.append('layerMapping', JSON.stringify(layerMapping));
        }

        try {
            const result = await $fetch('/api/cassettes/upload', {
                method: 'POST',
                body: formData,
            });

            state.cassettes.push(result);
            state.uploadStatus = 'idle';
            
            return result;
        } catch (error) {
            state.uploadStatus = 'error';
            console.error('Failed to upload cassette:', error);
            throw error;
        }
    },

    async updateCassette(cassetteId, data) {
        try {
            const updatedCassette = await $fetch(`/api/cassettes/${cassetteId}`, {
                method: 'PUT',
                body: data
            });
            
            const index = state.cassettes.findIndex(c => c._id === cassetteId);
            if (index !== -1) {
                state.cassettes[index] = updatedCassette;
            }
            
            return updatedCassette;
        } catch (error) {
            console.error('Failed to update cassette:', error);
            throw error;
        }
    },

    async deleteCassette(cassetteId) {
        try {
            await $fetch(`/api/cassettes/${cassetteId}`, { method: 'DELETE' });
            const deletedIndex = state.cassettes.findIndex(c => c._id === cassetteId);
            if (deletedIndex !== -1) {
                state.cassettes.splice(deletedIndex, 1);
            }
            if (state.selectedCassetteId === cassetteId) {
                state.selectedCassetteId = state.cassettes.length > 0 ? state.cassettes[0]._id : null;
            }
        } catch (error) {
            console.error('Failed to delete cassette:', error);
            throw error;
        }
    },

    setCassettes(cassettes) {
        state.cassettes = cassettes;
        if (cassettes.length > 0) {
            state.selectedCassetteId = cassettes[0]._id;
        }
    },

    updateCassette(cassette) {
        const index = state.cassettes.findIndex(c => c._id === cassette._id);
        if (index !== -1) {
            state.cassettes[index] = cassette;
        }
    },

    selectCassette(cassetteId) {
        state.selectedCassetteId = cassetteId;
    },

    setLayerMapping(mapping) {
        state.layerMapping = { ...state.layerMapping, ...mapping };
    }
};

export const cassettesStore = readonly({
    getters,
    actions,
});
