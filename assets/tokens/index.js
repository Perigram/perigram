/**
 * Primary is contrast, not a color: it rides the zinc surface scale, so
 * controls painted with it read as ink-on-surface — near-black on the light
 * canvas, near-white on the dark one — the monochrome primary style of the
 * PrimeVue showcase pages. PrimeVue's own focus rings and selection
 * highlights follow primary, so they stay neutral ink and zinc tints.
 * Brand energy lives in the Perigram accent (the logo red `#ff0040`),
 * reserved for text selection, the decision signal, and brand ink.
 */
const zincPrimary = {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b'
};

// The Perigram mark red from the logo, expanded into a full tonal ramp.
const perigramAccent = {
    50: '#feeef2',
    100: '#fddbe4',
    200: '#fbb9c9',
    300: '#fb8ba7',
    400: '#fc4d7b',
    500: '#ff0040',
    600: '#e1003c',
    700: '#be0033',
    800: '#9b0029',
    900: '#7b0021',
    950: '#4e0015'
};

export const designTokens = {
    palette: {
        primary: zincPrimary,
        accent: perigramAccent
    },
    color: {
        primary: 'var(--p-primary-color)',
        primaryInk: 'var(--ck-primary-ink)',
        primaryContrast: 'var(--p-primary-contrast-color)',
        accent: 'var(--p-accent-color)',
        accentInk: 'var(--ck-accent-ink)',
        accentContrast: 'var(--p-accent-contrast-color)',
        text: 'var(--p-text-color)',
        textMuted: 'var(--p-text-muted-color)',
        content: 'var(--p-content-background)',
        contentBorder: 'var(--p-content-border-color)',
        page: 'var(--ck-page-background)',
        processCanvas: 'var(--ck-process-canvas-background)',
        chrome: 'var(--ck-chrome-background)',
        chromeForeground: 'var(--ck-chrome-foreground)',
        chromeMuted: 'var(--ck-chrome-muted)',
        chromeSubtle: 'var(--ck-chrome-subtle)',
        chromeBorder: 'var(--ck-chrome-border)',
        subtle: 'var(--ck-subtle-background)',
        raised: 'var(--ck-surface-raised)',
        primarySurface: 'var(--ck-surface-primary)',
        borderSubtle: 'var(--ck-border-subtle)',
        selection: 'var(--ck-selection-background)'
    },
    layout: {
        pageMaxWidth: '1600px',
        gridGap: '1.25rem',
        boundedGridItemMinWidth: '24rem',
        boundedGridItemMaxWidth: '32rem',
        compactPreviewWidth: '10rem',
        detailsGap: '1.5rem',
        dialogSm: '24rem',
        dialogMd: '42rem',
        dialogLg: '56rem',
        dialogXl: '72rem',
        supportChatWidth: '25rem',
        supportChatHeight: '31.25rem',
        callWindowWidth: '30rem',
        callWindowHeight: '34rem',
        callWindowMinWidth: '22rem',
        callWindowMinHeight: '20rem',
        supportChatViewportMaxHeight: 'calc(100dvh - 6rem)',
        supportChatAdminHeight: 'calc(100vh - 12rem)',
        supportChatMessageMax: '70%',
        supportChatAdminMessageMax: '80%',
        entityPopoverMinWidth: '18.75rem',
        swatchSize: '2.625rem',
        floatingMenuMinWidth: '12.5rem',
        tableActionColumnWidth: '3rem',
        boardColumnMaxHeight: 'calc(100dvh - 16rem)'
    },
    typography: {
        ui: "'IBM Plex Sans', sans-serif",
        mono: "'IBM Plex Mono', monospace",
        serif: "'IBM Plex Serif', serif",
        roles: {
            'page-title': { fontFamily: 'ui', fontSize: 'clamp(1.75rem, 1.5rem + 1vw, 2.25rem)', lineHeight: '1.15', fontWeight: '700' },
            'section-heading': { fontFamily: 'ui', fontSize: '1.25rem', lineHeight: '1.5rem', fontWeight: '700' },
            body: { fontFamily: 'ui', fontSize: '1rem', lineHeight: '1.5rem', fontWeight: '400' },
            label: { fontFamily: 'ui', fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: '600', letterSpacing: '0.02em' },
            supporting: { fontFamily: 'ui', fontSize: '0.75rem', lineHeight: '1rem', fontWeight: '400' },
            metric: { fontFamily: 'ui', fontSize: '1.75rem', lineHeight: '2rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums' },
            technical: { fontFamily: 'mono', fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: '400' },
            prose: { fontFamily: 'serif', fontSize: '1rem', lineHeight: '1.625', fontWeight: '400' },
            // The document editing voice: serif like prose, one step larger
            // so authored content reads at a comfortable document size.
            editor: { fontFamily: 'serif', fontSize: '1.125rem', lineHeight: '1.625', fontWeight: '400' }
        }
    },
    status: {
        info: 'var(--ck-status-info)',
        success: 'var(--ck-status-success)',
        warning: 'var(--ck-status-warning)',
        danger: 'var(--ck-status-danger)',
        neutral: 'var(--ck-status-neutral)'
    },
    entityTone: {
        command: 'var(--ck-entity-tone-command)',
        fabrication: 'var(--ck-entity-tone-fabrication)',
        output: 'var(--ck-entity-tone-output)',
        material: 'var(--ck-entity-tone-material)',
        system: 'var(--ck-entity-tone-system)'
    },
    signal: {
        identity: 'var(--ck-signal-identity)',
        entity: 'var(--ck-signal-entity)',
        reference: 'var(--ck-signal-reference)',
        structure: 'var(--ck-signal-structure)',
        'structure-muted': 'var(--ck-signal-structure-muted)',
        data: 'var(--ck-signal-data)',
        quantity: 'var(--ck-signal-quantity)',
        decision: 'var(--ck-signal-decision)',
        projection: 'var(--ck-signal-projection)',
        external: 'var(--ck-signal-external)',
        value: 'var(--ck-signal-value)',
        effect: 'var(--ck-signal-effect)',
        temporal: 'var(--ck-signal-temporal)'
    }
};

export const cssVariableTokens = {
    // The gray page (zinc 100 light / zinc 950 dark) is the single canvas;
    // structural containers are transparent over it and PrimeVue
    // controls/overlays carry the lighter content surface. Structure reads
    // through borders and `subtle` insets (one step off the canvas),
    // elevation through overlay shadows.
    '--ck-page-background': 'var(--p-surface-100)',
    '--ck-process-canvas-background': 'var(--p-surface-50)',
    '--ck-chrome-background': 'var(--p-surface-100)',

    '--ck-chrome-foreground': 'var(--p-text-color)',
    '--ck-chrome-muted': 'var(--p-text-muted-color)',
    '--ck-chrome-subtle': 'var(--p-surface-200)',
    '--ck-chrome-border': 'var(--p-content-border-color)',
    '--ck-subtle-background': 'var(--p-surface-200)',
    '--ck-surface-raised': 'var(--p-content-background)',
    // The operation-card tint: the primary accent at a whisper over the
    // content surface — population primacy without border noise.
    '--ck-surface-primary': 'color-mix(in srgb, var(--p-primary-color) 7%, var(--p-content-background))',
    '--ck-border-subtle': 'var(--p-content-border-color)',
    '--ck-selection-background': 'color-mix(in srgb, var(--p-accent-color) 20%, transparent)',
    // Scrollbars ride the theme through the PrimeVue text color, which
    // flips per scheme, so no separate dark override is needed. The hover
    // step strengthens the same mix.
    '--ck-scrollbar-thumb': 'color-mix(in srgb, var(--p-text-color) 32%, transparent)',
    '--ck-scrollbar-thumb-hover': 'color-mix(in srgb, var(--p-text-color) 55%, transparent)',
    '--ck-primary-ink': '#3f3f46',
    '--ck-accent-ink': '#be0033',
    '--ck-font-ui': designTokens.typography.ui,
    '--ck-font-mono': designTokens.typography.mono,
    '--ck-font-serif': designTokens.typography.serif,
    '--ck-status-info': 'var(--p-primary-color)',
    '--ck-status-success': 'var(--p-emerald-600)',
    '--ck-status-warning': 'var(--p-amber-700)',
    '--ck-status-danger': 'var(--p-red-600)',
    '--ck-status-neutral': 'var(--p-surface-500)',
    '--ck-entity-tone-command': '#ff4b00',
    '--ck-entity-tone-fabrication': '#dc3a45',
    '--ck-entity-tone-output': '#3f5eff',
    '--ck-entity-tone-material': '#0d9069',
    '--ck-entity-tone-system': '#795ee5',
    '--ck-signal-identity': 'var(--p-surface-500)',
    '--ck-signal-entity': 'var(--ck-entity-tone-command)',
    '--ck-signal-reference': 'var(--ck-entity-tone-output)',
    '--ck-signal-structure': 'var(--ck-entity-tone-system)',
    // The declaration WIRE/frame tone: the structure family demuted toward
    // the muted ink so declaration-heavy graphs (16+ wires against 1 event
    // wire on real orgs) never out-shout the event chain — the primacy
    // contract's one derived canvas tone (hue stays full only on handles).
    '--ck-signal-structure-muted': 'color-mix(in srgb, var(--ck-signal-structure) 55%, var(--p-text-muted-color))',
    '--ck-signal-data': 'var(--ck-entity-tone-material)',
    '--ck-signal-quantity': '#d39700',
    '--ck-signal-decision': 'var(--ck-accent-500)',
    '--ck-signal-projection': 'var(--ck-entity-tone-system)',
    '--ck-signal-external': 'var(--ck-entity-tone-output)',
    '--ck-signal-value': 'var(--ck-entity-tone-system)',
    '--ck-signal-effect': 'var(--ck-entity-tone-fabrication)',
    '--ck-signal-temporal': 'var(--ck-entity-tone-output)',
    '--ck-page-max-width': designTokens.layout.pageMaxWidth,
    '--ck-grid-gap': designTokens.layout.gridGap,
    '--ck-bounded-grid-item-min-width': designTokens.layout.boundedGridItemMinWidth,
    '--ck-bounded-grid-item-max-width': designTokens.layout.boundedGridItemMaxWidth,
    '--ck-compact-preview-width': designTokens.layout.compactPreviewWidth,
    '--ck-details-gap': designTokens.layout.detailsGap,
    '--ck-dialog-sm': designTokens.layout.dialogSm,
    '--ck-dialog-md': designTokens.layout.dialogMd,
    '--ck-dialog-lg': designTokens.layout.dialogLg,
    '--ck-dialog-xl': designTokens.layout.dialogXl,
    '--ck-support-chat-width': designTokens.layout.supportChatWidth,
    '--ck-support-chat-height': designTokens.layout.supportChatHeight,
    '--ck-call-window-width': designTokens.layout.callWindowWidth,
    '--ck-call-window-height': designTokens.layout.callWindowHeight,
    '--ck-call-window-min-width': designTokens.layout.callWindowMinWidth,
    '--ck-call-window-min-height': designTokens.layout.callWindowMinHeight,
    '--ck-support-chat-viewport-max-height': designTokens.layout.supportChatViewportMaxHeight,
    '--ck-support-chat-admin-height': designTokens.layout.supportChatAdminHeight,
    '--ck-support-chat-message-max': designTokens.layout.supportChatMessageMax,
    '--ck-support-chat-admin-message-max': designTokens.layout.supportChatAdminMessageMax,
    '--ck-entity-popover-min-width': designTokens.layout.entityPopoverMinWidth,
    '--ck-swatch-size': designTokens.layout.swatchSize,
    '--ck-floating-menu-min-width': designTokens.layout.floatingMenuMinWidth,
    '--ck-table-action-column-width': designTokens.layout.tableActionColumnWidth,
    '--ck-board-column-max-height': designTokens.layout.boardColumnMaxHeight,
    ...Object.fromEntries(Object.entries(zincPrimary).map(([step, value]) => [`--ck-primary-${step}`, value])),
    ...Object.fromEntries(Object.entries(perigramAccent).map(([step, value]) => [`--ck-accent-${step}`, value]))
};

export const darkCssVariableTokens = {
    // Dark side of the gray-canvas contract; subtle stays one step lighter
    // for in-surface contrast.
    '--ck-page-background': 'var(--p-surface-950)',
    '--ck-process-canvas-background': 'var(--p-surface-950)',
    '--ck-chrome-background': 'var(--p-surface-950)',
    '--ck-chrome-foreground': 'var(--p-text-color)',
    '--ck-chrome-muted': 'var(--p-text-muted-color)',
    '--ck-chrome-subtle': 'var(--p-surface-800)',
    '--ck-chrome-border': 'var(--p-content-border-color)',
    '--ck-subtle-background': 'var(--p-surface-800)',
    '--ck-primary-ink': 'var(--ck-primary-300)',
    '--ck-accent-ink': 'var(--ck-accent-400)',
    '--ck-status-success': 'var(--p-emerald-400)',
    '--ck-status-warning': 'var(--p-amber-400)',
    '--ck-status-danger': 'var(--p-red-400)',
    '--ck-signal-identity': 'var(--p-surface-400)',
    '--ck-entity-tone-command': '#ff8b60',
    '--ck-entity-tone-fabrication': '#ff7079',
    '--ck-entity-tone-output': '#8292ff',
    '--ck-entity-tone-material': '#47ba91',
    '--ck-entity-tone-system': '#ae9aff',
    '--ck-signal-quantity': '#f2bc36'
};

export const tailwindThemeExtension = {
    colors: {
        primary: {
            DEFAULT: designTokens.color.primary,
            ink: designTokens.color.primaryInk,
            contrast: designTokens.color.primaryContrast,
            50: 'var(--p-primary-50)',
            100: 'var(--p-primary-100)',
            200: 'var(--p-primary-200)',
            300: 'var(--p-primary-300)',
            400: 'var(--p-primary-400)',
            500: 'var(--p-primary-500)',
            600: 'var(--p-primary-600)',
            700: 'var(--p-primary-700)',
            800: 'var(--p-primary-800)',
            900: 'var(--p-primary-900)',
            950: 'var(--p-primary-950)'
        },
        accent: {
            DEFAULT: designTokens.color.accent,
            ink: designTokens.color.accentInk,
            contrast: designTokens.color.accentContrast,
            50: 'var(--p-accent-50)',
            100: 'var(--p-accent-100)',
            200: 'var(--p-accent-200)',
            300: 'var(--p-accent-300)',
            400: 'var(--p-accent-400)',
            500: 'var(--p-accent-500)',
            600: 'var(--p-accent-600)',
            700: 'var(--p-accent-700)',
            800: 'var(--p-accent-800)',
            900: 'var(--p-accent-900)',
            950: 'var(--p-accent-950)'
        },
        content: designTokens.color.content,
        'content-border': designTokens.color.contentBorder,
        'primary-surface': designTokens.color.primarySurface,
        page: designTokens.color.page,
        'process-canvas': designTokens.color.processCanvas,
        chrome: designTokens.color.chrome,
        'chrome-foreground': designTokens.color.chromeForeground,
        'chrome-muted': designTokens.color.chromeMuted,
        'chrome-subtle': designTokens.color.chromeSubtle,
        'chrome-border': designTokens.color.chromeBorder,
        subtle: designTokens.color.subtle,
        // `muted` (not a `text-muted` key): Tailwind parses the `text-muted`
        // class as the text- color utility with the `muted` color path, so
        // the entry must live at colors.muted. A top-level 'text-muted' key
        // can never generate the class — every muted surface silently fell
        // back to the body color, which read as one uniform text color.
        muted: designTokens.color.textMuted,
        status: designTokens.status,
        entity: designTokens.entityTone,
        signal: designTokens.signal,
        surface: {
            0: 'var(--p-surface-0)',
            50: 'var(--p-surface-50)',
            100: 'var(--p-surface-100)',
            200: 'var(--p-surface-200)',
            300: 'var(--p-surface-300)',
            400: 'var(--p-surface-400)',
            500: 'var(--p-surface-500)',
            600: 'var(--p-surface-600)',
            700: 'var(--p-surface-700)',
            800: 'var(--p-surface-800)',
            900: 'var(--p-surface-900)',
            950: 'var(--p-surface-950)'
        }
    },
    maxWidth: {
        app: 'var(--ck-page-max-width)',
        'dialog-sm': 'var(--ck-dialog-sm)',
        'dialog-md': 'var(--ck-dialog-md)',
        'dialog-lg': 'var(--ck-dialog-lg)',
        'dialog-xl': 'var(--ck-dialog-xl)',
        'support-chat': 'var(--ck-support-chat-width)',
        'support-chat-message': 'var(--ck-support-chat-message-max)',
        'support-chat-admin-message': 'var(--ck-support-chat-admin-message-max)',
        'entity-popover': 'var(--ck-entity-popover-min-width)',
        'floating-menu': 'var(--ck-floating-menu-min-width)'
    },
    width: {
        swatch: 'var(--ck-swatch-size)',
        'support-chat': 'var(--ck-support-chat-width)',
        'call-window': 'var(--ck-call-window-width)'
    },
    height: {
        swatch: 'var(--ck-swatch-size)',
        'support-chat': 'var(--ck-support-chat-height)',
        'support-chat-admin': 'var(--ck-support-chat-admin-height)',
        'call-window': 'var(--ck-call-window-height)'
    },
    maxHeight: {
        'board-column': 'var(--ck-board-column-max-height)',
        'support-chat-viewport-max': 'var(--ck-support-chat-viewport-max-height)'
    },
    minHeight: {
        'support-chat': 'var(--ck-support-chat-height)',
        'call-window': 'var(--ck-call-window-min-height)'
    },
    minWidth: {
        'call-window': 'var(--ck-call-window-min-width)'
    },
    borderRadius: {
        ui: 'var(--p-border-radius-md)',
        panel: 'var(--p-border-radius-lg)'
    },
    fontFamily: {
        sans: 'var(--ck-font-ui)',
        mono: 'var(--ck-font-mono)',
        serif: 'var(--ck-font-serif)'
    },
    boxShadow: {
        card: 'var(--p-card-shadow)',
        overlay: 'var(--p-overlay-popover-shadow)'
    }
};

export const supportAvatarPalette = [
    'var(--p-red-500)',
    'var(--p-orange-500)',
    'var(--p-green-500)',
    'var(--p-blue-500)',
    'var(--p-indigo-500)',
    'var(--p-purple-500)',
    'var(--p-pink-500)'
];

// Zinc is the generic surface scale for both color schemes; the palette is
// projected through the preset primitive so the PrimeVue surface tokens and
// the app aliases that consume them stay in sync.
const zincSurface = {
    0: '#ffffff',
    50: '{zinc.50}',
    100: '{zinc.100}',
    200: '{zinc.200}',
    300: '{zinc.300}',
    400: '{zinc.400}',
    500: '{zinc.500}',
    600: '{zinc.600}',
    700: '{zinc.700}',
    800: '{zinc.800}',
    900: '{zinc.900}',
    950: '{zinc.950}'
};

export const primeSemanticTokens = {
    primary: zincPrimary,
    accent: perigramAccent,
    colorScheme: {
        light: {
            surface: zincSurface,
            primary: {
                color: '{surface.900}',
                hoverColor: '{surface.800}',
                activeColor: '{surface.700}',
                contrastColor: '{surface.0}'
            },
            accent: {
                color: '{accent.600}',
                hoverColor: '{accent.700}',
                activeColor: '{accent.800}',
                contrastColor: '#ffffff'
            }
        },
        dark: {
            surface: zincSurface,
            primary: {
                color: '{surface.50}',
                hoverColor: '{surface.200}',
                activeColor: '{surface.300}',
                contrastColor: '{surface.950}'
            },
            accent: {
                color: '{accent.500}',
                hoverColor: '{accent.400}',
                activeColor: '{accent.300}',
                contrastColor: '#ffffff'
            }
        }
    }
};

// Generic controls keep Material defaults except where the app-shell anatomy
// needs a token-level decision: tab strips are transparent so the chrome
// surface shows through, and tree rows run at explorer density.
// Collection chrome (table/tree-table/view headers, footers, footer cells,
// and paginators — standalone or embedded) is transparent everywhere:
// the hosting surface (page, panel, card) owns the background. Header
// chrome never paints at all — no hover or sorted-column tint (the sort
// state is the icon) — and carries no bottom border: the column header
// row reads through spacing, not a hairline. View/table header slots
// (the generated search and sort strips) drop the theme's side padding
// so they align with the content inside already-padded surfaces.
// Workspace surfaces ride the zero canvas: Panels and PanelMenu panels
// paint no background and Panels paint no border (PanelMenu panels keep
// Aura's default hairline border; the workspace node's pane Panels restore
// the same border locally), and Splitter gutters are invisible —
// draggable, never drawn. Fieldsets run compact everywhere: tight
// legend and root insets — a disclosure is a dense structural
// grouping, not an airy panel (the agent chronology tightens further
// per-instance through pt, which also owns what tokens cannot
// express: label size, the +/− glyph, and state-dependent chrome).
export const primeComponentTokens = {
    fieldset: {
        root: {
            padding: '0 0.75rem 0.75rem'
        },
        legend: {
            padding: '0.25rem 0.5rem',
            gap: '0.375rem'
        }
    },
    panel: {
        root: {
            background: 'transparent',
            borderColor: 'transparent'
        }
    },
    panelmenu: {
        panel: {
            background: 'transparent'
        }
    },
    listbox: {
        root: {
            borderColor: 'transparent'
        }
    },
    splitter: {
        gutter: {
            background: 'transparent'
        }
    },
    card: {
        root: {
            shadow: 'none'
        }
    },
    datatable: {
        root: {
            background: 'transparent'
        },
        header: {
            background: 'transparent',
            borderColor: 'transparent',
            borderWidth: '0 0 0 0',
            padding: '0 0 0.75rem 0',
            sm: {
                padding: '0 0 0.5rem 0'
            }
        },
        headerCell: {
            background: 'transparent',
            hoverBackground: 'transparent',
            selectedBackground: 'transparent',
            borderColor: 'transparent'
        },
        bodyCell: {
            background: 'transparent',
            // Notion-style rows: internal cell dividers stay structurally
            // present (1px) but transparent — a row surface reads as one
            // whole card, never as bordered strips.
            borderColor: 'transparent'
        },
        body: {
            background: 'transparent'
        },
        row: {
            // Every row paints as an instance surface (content
            // background) — the row IS the card; the recipe clips its
            // corners (a row's background is not clipped by its radius).
            background: 'var(--p-content-background)'
        },
        footer: {
            background: 'transparent',
            borderColor: 'transparent'
        },
        footerCell: {
            background: 'transparent',
            borderColor: 'transparent'
        },
        paginatorTop: {
            borderColor: 'transparent',
            borderWidth: '0 0 0 0'
        },
        paginatorBottom: {
            borderColor: 'transparent',
            borderWidth: '0 0 0 0'
        }
    },
    treetable: {
        root: {
            background: 'transparent'
        },
        header: {
            background: 'transparent',
            borderColor: 'transparent',
            borderWidth: '0 0 0 0',
            padding: '0 0 0.75rem 0',
            sm: {
                padding: '0 0 0.5rem 0'
            }
        },
        headerCell: {
            background: 'transparent',
            hoverBackground: 'transparent',
            selectedBackground: 'transparent',
            borderColor: 'transparent'
        },
        bodyCell: {
            background: 'transparent',
            // Same row-surface contract as datatable: transparent internal
            // dividers, rows painted as content surfaces.
            borderColor: 'transparent'
        },
        body: {
            background: 'transparent'
        },
        row: {
            // Every row paints as an instance surface (content
            // background) — the row IS the card; the recipe clips its
            // corners (a row's background is not clipped by its radius).
            background: 'var(--p-content-background)'
        },
        footer: {
            background: 'transparent',
            borderColor: 'transparent'
        },
        footerCell: {
            background: 'transparent',
            borderColor: 'transparent'
        },
        paginatorTop: {
            borderColor: 'transparent',
            borderWidth: '0 0 0 0'
        },
        paginatorBottom: {
            borderColor: 'transparent',
            borderWidth: '0 0 0 0'
        }
    },
    dataview: {
        root: {
            background: 'transparent'
        },
        header: {
            background: 'transparent',
            borderColor: 'transparent',
            borderWidth: '0 0 0 0',
            padding: '0 0 0.75rem 0'
        },
        content: {
            background: 'transparent'
        },
        footer: {
            background: 'transparent'
        },
        paginatorTop: {
            borderColor: 'transparent',
            borderWidth: '0 0 0 0'
        },
        paginatorBottom: {
            borderColor: 'transparent',
            borderWidth: '0 0 0 0'
        }
    },
    paginator: {
        root: {
            background: 'transparent'
        }
    },
    tabs: {
        tablist: {
            background: 'transparent'
        },
        tabpanel: {
            background: 'transparent'
        }
    },
    tree: {
        root: {
            background: 'transparent'
        }
    }
};

// Form fields fill their host by default: every form-field control mounts
// with PrimeVue's fluid class, so a bare input never sizes itself by its
// native `size` attribute inside dialogs, inspector panes, and form grids
// (the intrinsic default escapes narrow hosts). Width utilities
// (`w-full`, `flex-1`, `max-w-*`) still override — they are unlayered and
// beat the `primevue` cascade layer. Buttons are deliberately absent:
// fluid buttons stretch to 100%, and only PrimeVue's `Fluid` wrapper
// regions opt actions into that.
export const primeFormFluidPT = {
    inputtext: { root: { class: 'p-inputtext-fluid' } },
    textarea: { root: { class: 'p-textarea-fluid' } },
    inputnumber: { root: { class: 'p-inputnumber-fluid' } },
    select: { root: { class: 'p-select-fluid' } },
    multiselect: { root: { class: 'p-multiselect-fluid' } },
    datepicker: { root: { class: 'p-datepicker-fluid' } },
    password: { root: { class: 'p-password-fluid' } },
    autocomplete: { root: { class: 'p-autocomplete-fluid' } },
    treeselect: { root: { class: 'p-treeselect-fluid' } }
};
