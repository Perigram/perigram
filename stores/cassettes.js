import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCassettesStore = defineStore('cassettes', () => {
    const cassettes = ref([]);
    const selectedCassetteId = ref(null);
    const uploadStatus = ref('idle');
    const uploadProgress = ref(0);
    const detectedLayers = ref([]);
    const pollingIntervals = ref({});
    const layerMapping = ref({
        cut: [],
        bend: [],
        frame: [],
        dimensions: []
    });

    const selectedCassette = computed(() => 
        cassettes.value.find(c => c._id === selectedCassetteId.value)
    );

    function stopPolling(cassetteId) {
        if (pollingIntervals.value[cassetteId]) {
            clearInterval(pollingIntervals.value[cassetteId]);
            delete pollingIntervals.value[cassetteId];
        }
    }

    async function pollCassetteStatus(cassetteId) {
        if (pollingIntervals.value[cassetteId]) return;

        pollingIntervals.value[cassetteId] = setInterval(async () => {
            try {
                const data = await $fetch(`/api/cassettes/${cassetteId}`);
                
                const index = cassettes.value.findIndex(c => c._id === cassetteId);
                if (index !== -1) {
                    cassettes.value[index] = data;
                }

                if (!['pending', 'processing'].includes(data.processingStatus)) {
                    stopPolling(cassetteId);
                }
            } catch (err) {
                console.error(`Polling error for cassette ${cassetteId}:`, err);
                stopPolling(cassetteId);
            }
        }, 3000);
    }

    function checkTransientStatuses() {
        cassettes.value.forEach(cassette => {
            if (['pending', 'processing'].includes(cassette.processingStatus)) {
                pollCassetteStatus(cassette._id);
            }
        });
    }

    async function fetchCassettes() {
        try {
            const result = await $fetch('/api/cassettes');
            cassettes.value = Array.isArray(result) ? result : [];
            checkTransientStatuses();
            return cassettes.value;
        } catch (error) {
            console.error('Failed to fetch cassettes:', error);
            cassettes.value = [];
            return [];
        }
    }

    async function fetchById(id) {
        try {
            const data = await $fetch(`/api/cassettes/${id}`);
            if (['pending', 'processing'].includes(data.processingStatus)) {
                pollCassetteStatus(id);
            }
            return data;
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
            const template = result?.template || result;
            cassettes.value.push(template);
            uploadStatus.value = 'idle';
            pollCassetteStatus(template._id);
            return template;
        } catch (error) {
            uploadStatus.value = 'error';
            console.error('Failed to upload cassette:', error);
            throw error;
        }
    }

    async function createCassette(data) {
        try {
            const result = await $fetch('/api/cassettes', {
                method: 'POST',
                body: data,
            });
            cassettes.value.push(result);
            return result;
        } catch (error) {
            console.error('Failed to create cassette:', error);
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
        createCassette,
        updateCassette,
        deleteCassette,
        setCassettes,
        selectCassette,
        setLayerMapping,
        stopPolling,
        // Compatibility alias
        loadAll() { return fetchCassettes(); }
    };
});
