import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCassettesStore = defineStore('cassettes', () => {
    const cassettes = ref([]);
    const selectedCassetteId = ref(null);
    const uploadStatus = ref('idle');
    const uploadProgress = ref(0);
    const detectedLayers = ref([]);
    const layerMapping = ref({
        cut: [],
        bend: [],
        frame: [],
        dimensions: []
    });

    const selectedCassette = computed(() => 
        cassettes.value.find(c => c._id === selectedCassetteId.value)
    );

    async function fetchCassettes() {
        try {
            const result = await $fetch('/api/cassettes');
            cassettes.value = Array.isArray(result) ? result : [];
            return cassettes.value;
        } catch (error) {
            console.error('Failed to fetch cassettes:', error);
            cassettes.value = [];
            return [];
        }
    }

    async function fetchById(id) {
        try {
            return await $fetch(`/api/cassettes/${id}`);
        } catch (error) {
            console.error('Failed to fetch cassette:', error);
            throw error;
        }
    }

    async function uploadCassette(file, name, mapping) {
        uploadStatus.value = 'uploading';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        if (mapping) {
            formData.append('layerMapping', JSON.stringify(mapping));
        }

        try {
            const result = await $fetch('/api/cassettes/upload', {
                method: 'POST',
                body: formData,
            });
            cassettes.value.push(result);
            uploadStatus.value = 'idle';
            return result;
        } catch (error) {
            uploadStatus.value = 'error';
            console.error('Failed to upload cassette:', error);
            throw error;
        }
    }

    async function updateCassette(cassetteId, data) {
        try {
            const updatedCassette = await $fetch(`/api/cassettes/${cassetteId}`, {
                method: 'PUT',
                body: data
            });
            const index = cassettes.value.findIndex(c => c._id === cassetteId);
            if (index !== -1) {
                cassettes.value[index] = updatedCassette;
            }
            return updatedCassette;
        } catch (error) {
            console.error('Failed to update cassette:', error);
            throw error;
        }
    }

    async function deleteCassette(cassetteId) {
        try {
            await $fetch(`/api/cassettes/${cassetteId}`, { method: 'DELETE' });
            const index = cassettes.value.findIndex(c => c._id === cassetteId);
            if (index !== -1) {
                cassettes.value.splice(index, 1);
            }
            if (selectedCassetteId.value === cassetteId) {
                selectedCassetteId.value = cassettes.value.length > 0 ? cassettes.value[0]._id : null;
            }
        } catch (error) {
            console.error('Failed to delete cassette:', error);
            throw error;
        }
    }

    function setCassettes(newCassettes) {
        cassettes.value = newCassettes;
        if (newCassettes.length > 0) {
            selectedCassetteId.value = newCassettes[0]._id;
        }
    }

    function selectCassette(cassetteId) {
        selectedCassetteId.value = cassetteId;
    }

    function setLayerMapping(mapping) {
        layerMapping.value = { ...layerMapping.value, ...mapping };
    }

    return {
        cassettes,
        selectedCassetteId,
        uploadStatus,
        uploadProgress,
        detectedLayers,
        layerMapping,
        selectedCassette,
        fetchCassettes,
        fetchById,
        uploadCassette,
        updateCassette,
        deleteCassette,
        setCassettes,
        selectCassette,
        setLayerMapping,
        // Compatibility alias
        loadAll() { return fetchCassettes(); }
    };
});
