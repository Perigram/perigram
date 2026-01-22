import { useEntityStore } from '~/stores/entities';

export const useTraceability = () => {
    const entityStore = useEntityStore();

    /**
     * Resolves the full ancestry chain for an entity.
     * @param {string} type - Entity type
     * @param {object} entity - Entity data
     * @returns {Promise<Array>} - Array of { type, id, label, slug, data }
     */
    const resolveChain = async (type, entity) => {
        const rawAncestry = entityStore.getAncestry(type, entity);
        const chain = [];

        for (const item of rawAncestry) {
            const data = await entityStore.fetchEntity(item.type, item.id);
            chain.push({
                ...item,
                data,
                label: data?.name || data?.requisitionNumber || data?.batchNumber || item.id
            });
        }

        return chain;
    };

    return {
        resolveChain
    };
};
