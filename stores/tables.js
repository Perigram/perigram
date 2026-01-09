import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useTablesStore = defineStore('tables', () => {
    const tables = ref([]);
    const selectedTableId = ref(null);
    const uploadStatus = ref('idle'); // idle, uploading, mapping, validating, error
    const uploadProgress = ref(0);
    const validationErrors = ref([]);
    const detectedHeaders = ref([]);
    const requiredHeaders = ref([]);

    const selectedTable = computed(() => tables.value.find(t => t._id === selectedTableId.value));

    async function fetchTables(projectSlug) {
        try {
            const data = await $fetch(`/api/project/${projectSlug}/tables`);
            tables.value = data;
        } catch (error) {
            console.error('Failed to fetch tables:', error);
        }
    }

    async function uploadTable(projectSlug, file) {
        uploadStatus.value = 'uploading';
        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await $fetch(`/api/project/${projectSlug}/tables/upload`, {
                method: 'POST',
                body: formData,
            });

            uploadStatus.value = 'mapping';
            detectedHeaders.value = result.detectedHeaders;
            requiredHeaders.value = result.requiredHeaders;
            tables.value.push(result);
            selectedTableId.value = result._id;
        } catch (error) {
            uploadStatus.value = 'error';
            console.error('Failed to upload table:', error);
        }
    }

    function updateTable(table) {
        const index = tables.value.findIndex(t => t._id === table._id);
        if (index !== -1) {
            tables.value[index] = table;
        }
    }

    async function mapAndValidateTable(tableId, mappings) {
        uploadStatus.value = 'validating';
        try {
            const updatedTable = await $fetch(`/api/tables/${tableId}`, {
                method: 'PUT',
                body: { columnMappings: mappings, status: 'validated' },
            });
            uploadStatus.value = 'idle';
            updateTable(updatedTable);
        } catch (error) {
            uploadStatus.value = 'error';
            validationErrors.value = error.data?.data || [];
            console.error('Failed to validate table:', error);
        }
    }

    async function deleteTable(tableId) {
        try {
            await $fetch(`/api/tables/${tableId}`, { method: 'DELETE' });
            const index = tables.value.findIndex(t => t._id === tableId);
            if (index === -1) return;

            tables.value.splice(index, 1);

            if (selectedTableId.value === tableId) {
                selectedTableId.value = tables.value.length > 0 ? tables.value[0]._id : null;
            }
        } catch (error) {
            console.error('Failed to delete table:', error);
        }
    }

    async function createTable(projectSlug, name) {
        try {
            const newTable = await $fetch(`/api/project/${projectSlug}/tables/create`, {
                method: 'POST',
                body: { name },
            });
            tables.value.push(newTable);
            selectedTableId.value = newTable._id;
        } catch (error) {
            console.error('Failed to create table:', error);
        }
    }

    function setTables(newTables) {
        tables.value = newTables;
        if (newTables.length > 0) {
            selectedTableId.value = newTables[0]._id;
        }
    }

    function selectTable(tableId) {
        selectedTableId.value = tableId;
    }

    return {
        tables,
        selectedTableId,
        uploadStatus,
        uploadProgress,
        validationErrors,
        detectedHeaders,
        requiredHeaders,
        selectedTable,
        fetchTables,
        uploadTable,
        mapAndValidateTable,
        deleteTable,
        createTable,
        setTables,
        updateTable,
        selectTable
    };
});
