import { computed, reactive, readonly } from 'vue';

const state = reactive({
    tables: [],
    selectedTableId: null,
    uploadStatus: 'idle', // idle, uploading, mapping, validating, error
    uploadProgress: 0,
    validationErrors: [],
    detectedHeaders: [],
    requiredHeaders: [],
});

const getters = {
    tables: computed(() => state.tables),
    selectedTable: computed(() => state.tables.find(t => t._id === state.selectedTableId)),
    uploadStatus: computed(() => state.uploadStatus),
    validationErrors: computed(() => state.validationErrors),
};

const actions = {
    async fetchTables(projectSlug) {
        try {
            const tables = await $fetch(`/api/project/${projectSlug}/tables`);
            state.tables = tables;
        } catch (error) {
            console.error('Failed to fetch tables:', error);
        }
    },

    async uploadTable(projectSlug, file) {
        state.uploadStatus = 'uploading';
        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await $fetch(`/api/project/${projectSlug}/tables/upload`, {
                method: 'POST',
                body: formData,
            });

            state.uploadStatus = 'mapping';
            state.detectedHeaders = result.detectedHeaders;
            state.requiredHeaders = result.requiredHeaders;
            state.tables.push(result);
            state.selectedTableId = result._id;
        } catch (error) {
            state.uploadStatus = 'error';
            console.error('Failed to upload table:', error);
        }
    },

    async mapAndValidateTable(tableId, mappings) {
        state.uploadStatus = 'validating';
        try {
            const updatedTable = await $fetch(`/api/tables/${tableId}`,
                {
                    method: 'PUT',
                    body: { columnMappings: mappings, status: 'validated' },
                });
            state.uploadStatus = 'idle';
            this.updateTable(updatedTable);
        } catch (error) {
            state.uploadStatus = 'error';
            state.validationErrors = error.data.data;
            console.error('Failed to validate table:', error);
        }
    },

    async deleteTable(tableId) {
        try {
            await $fetch(`/api/tables/${tableId}`, { method: 'DELETE' });
            const deletedIndex = state.tables.findIndex(t => t._id === tableId);
            if (deletedIndex === -1) return;

            state.tables.splice(deletedIndex, 1);

            if (state.selectedTableId === tableId) {
                state.selectedTableId = state.tables.length > 0 ? state.tables[0]._id : null;
            }
        } catch (error) {
            console.error('Failed to delete table:', error);
        }
    },

    async createTable(projectSlug, name) {
        try {
            const newTable = await $fetch(`/api/project/${projectSlug}/tables/create`, {
                method: 'POST',
                body: { name },
            });
            state.tables.push(newTable);
            state.selectedTableId = newTable._id; // Automatically select the new table
        } catch (error) {
            console.error('Failed to create table:', error);
        }
    },

    setTables(tables) {
        state.tables = tables;
        if (tables.length > 0) {
            state.selectedTableId = tables[0]._id;
        }
    },

    updateTable(table) {
        const index = state.tables.findIndex(t => t._id === table._id);
        if (index !== -1) {
            state.tables[index] = table;
        }
    },

    selectTable(tableId) {
        state.selectedTableId = tableId;
    }
};

export const tablesStore = readonly({
    getters,
    actions,
});
