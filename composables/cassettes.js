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
    cassettes: computed(() => state.cassettes),
    selectedCassette: computed(() => state.cassettes.find(c => c._id === state.selectedCassetteId)),
    uploadStatus: computed(() => state.uploadStatus),
    detectedLayers: computed(() => state.detectedLayers),
    layerMapping: computed(() => state.layerMapping)
};

const actions = {
    async fetchCassettes() {
        try {
            const cassettes = await $fetch('/api/cassettes');
            state.cassettes = cassettes;
        } catch (error) {
            console.error('Failed to fetch cassettes:', error);
        }
    },

    async uploadCassette(file, name) {
        state.uploadStatus = 'uploading';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);

        try {
            const result = await $fetch('/api/cassettes/upload', {
                method: 'POST',
                body: formData,
            });

            state.uploadStatus = 'mapping';
            state.detectedLayers = result.detectedLayers;
            state.cassettes.push(result);
            state.selectedCassetteId = result._id;
            
            return result;
        } catch (error) {
            state.uploadStatus = 'error';
            console.error('Failed to upload cassette:', error);
            throw error;
        }
    },

    async mapLayers(cassetteId, layerMapping) {
        state.uploadStatus = 'processing';
        try {
            const updatedCassette = await $fetch(`/api/cassettes/${cassetteId}/mappings`, {
                method: 'PUT',
                body: { layerMapping }
            });
            
            state.uploadStatus = 'idle';
            this.updateCassette(updatedCassette);
            return updatedCassette;
        } catch (error) {
            state.uploadStatus = 'error';
            console.error('Failed to map cassette layers:', error);
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
