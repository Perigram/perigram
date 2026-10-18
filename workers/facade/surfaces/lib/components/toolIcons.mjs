// Tool glyphs for the profile sketch editor's toolbar: Tabler Icons
// v3.31.0 outline set (MIT, (c) Tabler), vendored as path data because
// surfaces render their own SVG inline (the engine bundle ships no
// icon set, and icon fonts cannot carry stroke glyphs). `arc` is the
// outer arc of Tabler's `rainbow`. Buttons pair these with their
// localized aria-label/title.
const TOOL_ICON_PATHS = {
  select: ["M4 6a2 2 0 0 1 2 -2m3 0h1.5m3 0h1.5m3 0a2 2 0 0 1 2 2m0 3v1.5m0 3v1.5m0 3a2 2 0 0 1 -2 2m-3 0h-1.5m-3 0h-1.5m-3 0a2 2 0 0 1 -2 -2m0 -3v-1.5m0 -3v-1.5m0 -3"],
  line: [
    "M6 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M18 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M7.5 16.5l9 -9"
  ],
  polyline: [
    "M3 3m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z",
    "M17 3m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z",
    "M17 17m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z",
    "M3 17m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z",
    "M5 7l0 10",
    "M19 7l0 10",
    "M7 5l10 0",
    "M7 19l10 0"
  ],
  circle: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"],
  arc: ["M22 17c0 -5.523 -4.477 -10 -10 -10s-10 4.477 -10 10"],
  rectang: ["M3 3m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"],
  erase: [
    "M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3",
    "M18 13.3l-6.3 -6.3"
  ],
  undo: [
    "M9 14l-4 -4l4 -4",
    "M5 10h11a4 4 0 1 1 0 8h-1"
  ],
  redo: [
    "M15 14l4 -4l-4 -4",
    "M19 10h-11a4 4 0 1 0 0 8h1"
  ],
  basis: [
    "M12 9v12m-8 -8a8 8 0 0 0 16 0m1 0h-2m-14 0h-2",
    "M12 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"
  ],
  ortho: [
    "M21 19h-18l9 -15",
    "M20.615 15.171h.015",
    "M19.515 11.771h.015",
    "M17.715 8.671h.015",
    "M15.415 5.971h.015"
  ],
  tangentSnap: [
    "M4 13v-8a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v8a2 2 0 0 0 6 0v-8a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v8a8 8 0 0 1 -16 0",
    "M4 8l5 0",
    "M15 8l4 0"
  ],
  commandLine: [
    "M8 9l3 3l-3 3",
    "M13 15l3 0",
    "M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"
  ],
  closedShape: ["M13.163 2.168l8.021 5.828c.694 .504 .984 1.397 .719 2.212l-3.064 9.43a1.978 1.978 0 0 1 -1.881 1.367h-9.916a1.978 1.978 0 0 1 -1.881 -1.367l-3.064 -9.43a1.978 1.978 0 0 1 .719 -2.212l8.021 -5.828a1.978 1.978 0 0 1 2.326 0z"],
  openShape: [
    "M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
    "M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z",
    "M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"
  ],
  materialSide: [
    "M4 5h16v14h-16z",
    "M12 5v14",
    "M5.5 15.5l4 -4",
    "M5.5 10.5l5 -5",
    "M8.5 15.5l3 -3"
  ],
  zoomFit: [
    "M4 7l16 0",
    "M4 17l16 0",
    "M7 4l0 16",
    "M17 4l0 16"
  ],
  importDxf: [
    "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2",
    "M7 9l5 -5l5 5",
    "M12 4l0 12"
  ],
  clear: [
    "M4 7l16 0",
    "M10 11l0 6",
    "M14 11l0 6",
    "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12",
    "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"
  ],
};

// One inline glyph: stroke styling matches the Tabler outline source
// (currentColor, round caps/joins); dense toolbar buttons read best at
// a slightly lighter stroke than the source's 2px.
export const toolIcon = (h, name, size = 15) => h(
  'svg',
  {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: 'shrink-0'
  },
  (TOOL_ICON_PATHS[name] || []).map(d => h('path', { d, key: d }))
);
