/**
 * Signal orange is reserved for intent, selection, and focus. It carries the
 * app's energy without tinting every operational surface.
 */
const signalOrangePrimary = {
    50: '#fff0e9',
    100: '#ffdaca',
    200: '#ffb396',
    300: '#ff8b60',
    400: '#ff6733',
    500: '#ff4b00',
    600: '#db4100',
    700: '#a93300',
    800: '#7c2600',
    900: '#5c1c00',
    950: '#321000'
};

export const designTokens = {
    palette: {
        primary: signalOrangePrimary
    },
    color: {
        primary: 'var(--p-primary-color)',
        primaryInk: 'var(--ck-primary-ink)',
        primaryContrast: 'var(--p-primary-contrast-color)',
        primaryEmphasis: 'var(--p-primary-emphasis-color)',
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
        borderSubtle: 'var(--ck-border-subtle)',
        selection: 'var(--ck-selection-background)'
    },
    layout: {
        pageMaxWidth: '1600px',
        chromeSignalHeight: '0.25rem',
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
        supportChatAdminHeight: 'calc(100vh - 12rem)',
        supportChatMessageMax: '85%',
        supportChatAdminMessageMax: '80%',
        entityPopoverMinWidth: '18.75rem',
        swatchSize: '2.625rem',
        floatingMenuMinWidth: '12.5rem',
        previewDialogHeight: '95vh',
        tableActionColumnWidth: '3rem'
    },
    radius: {
        ui: '3px',
        panel: '6px',
        full: '9999px'
    },
    shadow: {
        card: 'none',
        overlay: '0 12px 28px rgb(16 16 14 / 0.14)'
    },
    motion: {
        fast: '100ms',
        normal: '160ms',
        emphasis: '220ms',
        seconds: {
            fast: 0.1,
            normal: 0.16,
            emphasis: 0.22
        },
        easing: {
            standard: 'cubic-bezier(0.2, 0, 0, 1)',
            enter: 'cubic-bezier(0, 0, 0, 1)',
            exit: 'cubic-bezier(0.3, 0, 1, 1)'
        },
        spring: {
            dock: { mass: 0.1, stiffness: 180, damping: 16 }
        }
    },
    dock: {
        inset: '0.75rem',
        gap: '0.25rem',
        padding: '0.25rem',
        labelOffset: '0.5rem',
        labelPadding: '0.125rem 0.5rem',
        indicatorSize: '0.375rem',
        indicatorInset: '0.125rem',
        panelHeight: 40,
        baseItemSize: 32,
        magnification: 40,
        distance: 96,
        height: 64
    },
    typography: {
        ui: "'IBM Plex Sans', sans-serif",
        mono: "'IBM Plex Mono', monospace",
        serif: "'IBM Plex Serif', serif",
        labelTracking: '0.04em',
        caption: ['0.75rem', { lineHeight: '1rem' }],
        body: ['0.875rem', { lineHeight: '1.25rem' }],
        title: ['1.25rem', { lineHeight: '1.5rem' }],
        display: ['1.75rem', { lineHeight: '2rem' }]
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
    '--ck-page-background': 'var(--p-surface-100)',
    '--ck-process-canvas-background': 'var(--p-surface-50)',
    '--ck-chrome-background': '#fefefc',
    '--ck-chrome-foreground': '#0c0c0b',
    '--ck-chrome-muted': '#6d6d66',
    '--ck-chrome-subtle': '#f4f4f0',
    '--ck-chrome-border': '#c7c7bf',
    '--ck-subtle-background': 'var(--p-surface-100)',
    '--ck-surface-raised': 'var(--p-content-background)',
    '--ck-border-subtle': 'var(--p-content-border-color)',
    '--ck-selection-background': 'color-mix(in srgb, var(--p-primary-color) 20%, transparent)',
    '--ck-primary-ink': '#a93300',
    '--ck-font-ui': designTokens.typography.ui,
    '--ck-font-mono': designTokens.typography.mono,
    '--ck-font-serif': designTokens.typography.serif,
    '--ck-label-tracking': designTokens.typography.labelTracking,
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
    '--ck-signal-data': 'var(--ck-entity-tone-material)',
    '--ck-signal-quantity': '#d39700',
    '--ck-signal-decision': 'var(--ck-primary-500)',
    '--ck-signal-projection': 'var(--ck-entity-tone-system)',
    '--ck-signal-external': 'var(--ck-entity-tone-output)',
    '--ck-signal-value': 'var(--ck-entity-tone-system)',
    '--ck-signal-effect': 'var(--ck-entity-tone-fabrication)',
    '--ck-signal-temporal': 'var(--ck-entity-tone-output)',
    '--ck-page-max-width': designTokens.layout.pageMaxWidth,
    '--ck-chrome-signal-height': designTokens.layout.chromeSignalHeight,
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
    '--ck-support-chat-admin-height': designTokens.layout.supportChatAdminHeight,
    '--ck-support-chat-message-max': designTokens.layout.supportChatMessageMax,
    '--ck-support-chat-admin-message-max': designTokens.layout.supportChatAdminMessageMax,
    '--ck-entity-popover-min-width': designTokens.layout.entityPopoverMinWidth,
    '--ck-swatch-size': designTokens.layout.swatchSize,
    '--ck-floating-menu-min-width': designTokens.layout.floatingMenuMinWidth,
    '--ck-preview-dialog-height': designTokens.layout.previewDialogHeight,
    '--ck-table-action-column-width': designTokens.layout.tableActionColumnWidth,
    '--ck-radius-ui': designTokens.radius.ui,
    '--ck-radius-panel': designTokens.radius.panel,
    '--ck-radius-full': designTokens.radius.full,
    '--ck-shadow-card': designTokens.shadow.card,
    '--ck-shadow-overlay': designTokens.shadow.overlay,
    '--ck-motion-fast': designTokens.motion.fast,
    '--ck-motion-normal': designTokens.motion.normal,
    '--ck-motion-emphasis': designTokens.motion.emphasis,
    '--ck-ease-standard': designTokens.motion.easing.standard,
    '--ck-ease-enter': designTokens.motion.easing.enter,
    '--ck-ease-exit': designTokens.motion.easing.exit,
    '--ck-dock-inset': designTokens.dock.inset,
    '--ck-dock-gap': designTokens.dock.gap,
    '--ck-dock-padding': designTokens.dock.padding,
    '--ck-dock-label-offset': designTokens.dock.labelOffset,
    '--ck-dock-label-padding': designTokens.dock.labelPadding,
    '--ck-dock-indicator-size': designTokens.dock.indicatorSize,
    '--ck-dock-indicator-inset': designTokens.dock.indicatorInset,
    ...Object.fromEntries(Object.entries(signalOrangePrimary).map(([step, value]) => [`--ck-primary-${step}`, value]))
};

export const tailwindThemeExtension = {
    colors: {
        primary: {
            DEFAULT: designTokens.color.primary,
            ink: designTokens.color.primaryInk,
            contrast: designTokens.color.primaryContrast,
            emphasis: designTokens.color.primaryEmphasis,
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
        content: designTokens.color.content,
        'content-border': designTokens.color.contentBorder,
        page: designTokens.color.page,
        'process-canvas': designTokens.color.processCanvas,
        chrome: designTokens.color.chrome,
        'chrome-foreground': designTokens.color.chromeForeground,
        'chrome-muted': designTokens.color.chromeMuted,
        'chrome-subtle': designTokens.color.chromeSubtle,
        'chrome-border': designTokens.color.chromeBorder,
        subtle: designTokens.color.subtle,
        'text-muted': designTokens.color.textMuted,
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
        'entity-popover': 'var(--ck-entity-popover-min-width)',
        'floating-menu': 'var(--ck-floating-menu-min-width)'
    },
    width: {
        swatch: 'var(--ck-swatch-size)'
    },
    height: {
        swatch: 'var(--ck-swatch-size)',
        'support-chat': 'var(--ck-support-chat-height)',
        'support-chat-admin': 'var(--ck-support-chat-admin-height)',
        'preview-dialog': 'var(--ck-preview-dialog-height)'
    },
    minHeight: {
        'support-chat': 'var(--ck-support-chat-height)'
    },
    borderRadius: {
        ui: 'var(--ck-radius-ui)',
        panel: 'var(--ck-radius-panel)'
    },
    fontFamily: {
        sans: 'var(--ck-font-ui)',
        mono: 'var(--ck-font-mono)',
        serif: 'var(--ck-font-serif)'
    },
    fontSize: {
        'ui-caption': designTokens.typography.caption,
        'ui-body': designTokens.typography.body,
        'ui-title': designTokens.typography.title,
        'ui-display': designTokens.typography.display
    },
    letterSpacing: {
        label: 'var(--ck-label-tracking)'
    },
    boxShadow: {
        card: 'var(--ck-shadow-card)',
        overlay: 'var(--ck-shadow-overlay)'
    },
    transitionDuration: {
        DEFAULT: 'var(--ck-motion-normal)',
        fast: 'var(--ck-motion-fast)',
        normal: 'var(--ck-motion-normal)',
        emphasis: 'var(--ck-motion-emphasis)'
    },
    transitionTimingFunction: {
        DEFAULT: 'var(--ck-ease-standard)',
        enter: 'var(--ck-ease-enter)',
        exit: 'var(--ck-ease-exit)'
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

export const primeSemanticTokens = {
    primary: signalOrangePrimary
};

// Generic controls and containers intentionally inherit Aura unchanged.
export const primeComponentTokens = {};
