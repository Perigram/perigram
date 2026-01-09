import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useToolProfilesStore = defineStore('toolProfiles', () => {
    const tools = ref([]);
    const loading = ref(false);
    const error = ref(null);

    const systemTools = computed(() => tools.value.filter(t => !t.ownerId));
    const userTools = computed(() => tools.value.filter(t => t.ownerId));

    async function fetchTools() {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch('/api/templates/tools');
            tools.value = data;
        } catch (err) {
            error.value = err.message;
            console.error('Failed to fetch tool profiles:', err);
        } finally {
            loading.value = false;
        }
    }

    async function createTool(toolData) {
        try {
            const tool = await $fetch('/api/templates/tools', {
                method: 'POST',
                body: toolData
            });
            tools.value.push(tool);
            return tool;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function updateTool(id, updates) {
        try {
            const tool = await $fetch(`/api/templates/tools/${id}`, {
                method: 'PUT',
                body: updates
            });
            const index = tools.value.findIndex(t => t._id === id);
            if (index !== -1) {
                tools.value[index] = tool;
            }
            return tool;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deleteTool(id) {
        try {
            await $fetch(`/api/templates/tools/${id}`, {
                method: 'DELETE'
            });
            tools.value = tools.value.filter(t => t._id !== id);
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    return {
        tools,
        loading,
        error,
        systemTools,
        userTools,
        fetchTools,
        createTool,
        updateTool,
        deleteTool
    };
});
