// Palette label resolution: localized job names/descriptions with a
// humanized-kind fallback. Shared by the palette filter, node cards, and
// the sync pass's display labels so one item has one label everywhere.
import { humanizeNodeLabel } from '~/packages/processes/src/index.js';

export function createPaletteText({ t, te }) {
  function paletteLabel(item) {
    if (item.labelKey && te(item.labelKey)) return t(item.labelKey);
    const key = `processDesigner.paletteItems.${item.label}`;
    return te(key) ? t(key) : humanizeNodeLabel(item.label);
  }

  function paletteDescription(item) {
    const key = `processDesigner.paletteDescriptions.${item.description || item.label}`;
    return te(key) ? t(key) : paletteLabel(item);
  }

  function paletteGroupLabel(id) {
    const key = `processDesigner.paletteGroups.${id}`;
    return te(key) ? t(key) : humanizeNodeLabel(id);
  }

  function paletteSearchText(item) {
    return [item.kind, paletteLabel(item), paletteDescription(item)].join(' ').toLowerCase();
  }

  return { paletteLabel, paletteDescription, paletteGroupLabel, paletteSearchText };
}
