const itemSourceId = (item = {}) => item.item_id ?? item.itemId ?? item.id;

const mergeCounts = (...groups) => {
  const counts = new Map();
  groups.flat().forEach((item) => {
    const cassetteDesignId = item.cassetteDesignId?.toString?.() || item.cassetteDesignId;
    if (!cassetteDesignId) return;
    const current = counts.get(cassetteDesignId) || { cassetteDesignId, count: 0 };
    current.count += Number(item.count || 0);
    counts.set(cassetteDesignId, current);
  });
  return Array.from(counts.values()).sort((left, right) => left.cassetteDesignId.localeCompare(right.cassetteDesignId));
};

const countsFromPlacements = (result = {}) => {
  const sourceById = new Map((result.items || [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const layouts = result.solution?.layouts || result.layouts || [];
  const counts = new Map();
  let unresolved = 0;

  layouts.forEach((layout) => {
    const placedItems = layout.placed_items || layout.items || [];
    placedItems.forEach((placedItem) => {
      const source = sourceById.get(itemSourceId(placedItem)?.toString()) || placedItem;
      const cassetteDesignId = source.cassette_id || source.cassetteId || placedItem.cassette_id || placedItem.cassetteDesignId;
      if (!cassetteDesignId) {
        unresolved += 1;
        return;
      }
      const key = cassetteDesignId.toString();
      const current = counts.get(key) || { cassetteDesignId: key, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return {
    counts: Array.from(counts.values()),
    unresolved
  };
};

const countsFromDemand = (result = {}) => {
  const counts = new Map();
  (result.items || []).forEach((item) => {
    const cassetteDesignId = item.cassette_id || item.cassetteId;
    if (!cassetteDesignId) return;
    const key = cassetteDesignId.toString();
    const current = counts.get(key) || { cassetteDesignId: key, count: 0 };
    current.count += Number(item.demand || item.count || 1);
    counts.set(key, current);
  });
  return Array.from(counts.values());
};

export function cassetteDesignCountsForSheetDesign(design = {}) {
  const explicit = Array.isArray(design.data?.cassetteDesigns) ? design.data.cassetteDesigns : [];
  const result = design.data?.geometry?.data || {};
  const placed = countsFromPlacements(result);
  const fallback = placed.unresolved > 0 ? countsFromDemand(result) : [];
  const derived = fallback.length ? fallback : placed.counts;
  return derived.length ? mergeCounts(derived) : mergeCounts(explicit);
}

export function cassettePlacementCountForSheetDesign(design = {}) {
  return cassetteDesignCountsForSheetDesign(design).reduce((sum, item) => sum + Number(item.count || 0), 0);
}
