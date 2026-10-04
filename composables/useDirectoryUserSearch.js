import { ref, watch } from 'vue';

// Debounced, stale-response-safe directory user search shared by the chat
// pickers and the invite dialog (search contract:
// server/features/directory/README.md). Results exclude the caller's own
// entry; a query under two characters clears them.
export function useDirectoryUserSearch() {
    const query = ref('');
    const results = ref([]);
    const searching = ref(false);
    let timer = null;
    let seq = 0;

    watch(query, (value) => {
        clearTimeout(timer);
        const normalized = value.trim();
        if (normalized.length < 2) {
            results.value = [];
            searching.value = false;
            return;
        }
        searching.value = true;
        timer = setTimeout(async () => {
            const current = ++seq;
            try {
                const response = await $fetch('/api/directory/search', {
                    query: { q: normalized, types: 'user' }
                });
                if (current !== seq) return;
                results.value = (response?.groups || [])
                    .flatMap(group => group.results || [])
                    .filter(entry => !entry.directory?.isSelf);
            } catch {
                if (current === seq) results.value = [];
            } finally {
                if (current === seq) searching.value = false;
            }
        }, 300);
    });

    return { query, results, searching };
}
