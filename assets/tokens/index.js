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

/**
 * Hard neutrals give the workbench an ink-and-near-white hierarchy. Calibrated
 * value steps keep operational surfaces distinct without a tinted dashboard.
 */
const hardNeutralSurface = {
    0: '#fefefc',
    50: '#f4f4f0',
    100: '#ecece7',
    200: '#dfdfd9',
    300: '#c7c7bf',
    400: '#999992',
    500: '#6d6d66',
    600: '#4e4e49',
    700: '#343431',
    800: '#232321',
    900: '#161615',
    950: '#0c0c0b'
};

export const designTokens = {
    palette: {
        primary: signalOrangePrimary,
        surface: hardNeutralSurface
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
        labelTracking: '0.04em'
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
    ...Object.fromEntries(Object.entries(signalOrangePrimary).map(([step, value]) => [`--ck-primary-${step}`, value])),
    ...Object.fromEntries(Object.entries(hardNeutralSurface).map(([step, value]) => [`--ck-surface-${step}`, value]))
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
    transitionDuration: 'var(--ck-motion-normal)',
    primary: signalOrangePrimary,
    focusRing: {
        width: '2px',
        style: 'solid',
        color: '{primary.600}',
        offset: '2px',
        shadow: '0 0 0 3px color-mix(in srgb, {primary.500}, transparent 76%)'
    },
    content: {
        borderRadius: 'var(--ck-radius-ui)'
    },
    formField: {
        borderRadius: 'var(--ck-radius-ui)',
        paddingX: '0.75rem',
        paddingY: '0.5625rem',
        focusRing: {
            width: '2px',
            style: 'solid',
            color: '{primary.600}',
            offset: '1px',
            shadow: '0 0 0 3px color-mix(in srgb, {primary.500}, transparent 80%)'
        }
    },
    overlay: {
        select: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        popover: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        modal: {
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        }
    },
    colorScheme: {
        light: {
            surface: hardNeutralSurface,
            primary: {
                color: '{primary.500}',
                contrastColor: '{surface.950}',
                hoverColor: '{primary.600}',
                activeColor: '{primary.700}'
            },
            content: {
                background: '{surface.0}',
                hoverBackground: '{surface.100}',
                borderColor: '{surface.300}',
                color: '{surface.950}'
            },
            text: {
                color: '{surface.950}',
                hoverColor: '{surface.900}',
                mutedColor: '{surface.500}',
                hoverMutedColor: '{surface.600}'
            },
            formField: {
                background: '{surface.0}',
                disabledBackground: '{surface.100}',
                filledBackground: '{surface.50}',
                filledHoverBackground: '{surface.100}',
                filledFocusBackground: '{surface.0}',
                borderColor: '{surface.300}',
                hoverBorderColor: '{surface.400}',
                focusBorderColor: '{primary.600}',
                invalidBorderColor: '{red.500}',
                color: '{surface.900}',
                disabledColor: '{surface.500}',
                placeholderColor: '{surface.500}',
                invalidPlaceholderColor: '{red.600}'
            },
            highlight: {
                background: 'color-mix(in srgb, {primary.100}, transparent 12%)',
                focusBackground: '{primary.200}',
                color: '{primary.900}',
                focusColor: '{primary.900}'
            }
        },
        dark: {
            surface: hardNeutralSurface,
            primary: {
                color: '{primary.400}',
                contrastColor: '{surface.950}',
                hoverColor: '{primary.300}',
                activeColor: '{primary.200}'
            },
            content: {
                background: '{surface.900}',
                hoverBackground: '{surface.800}',
                borderColor: 'color-mix(in srgb, {surface.600}, transparent 46%)',
                color: '{surface.50}'
            },
            text: {
                color: '{surface.50}',
                hoverColor: '{surface.0}',
                mutedColor: '{surface.400}',
                hoverMutedColor: '{surface.300}'
            },
            formField: {
                background: '{surface.950}',
                disabledBackground: '{surface.900}',
                filledBackground: '{surface.900}',
                filledHoverBackground: '{surface.800}',
                filledFocusBackground: '{surface.950}',
                borderColor: '{surface.700}',
                hoverBorderColor: '{surface.600}',
                focusBorderColor: '{primary.400}',
                invalidBorderColor: '{red.400}',
                color: '{surface.50}',
                disabledColor: '{surface.500}',
                placeholderColor: '{surface.400}',
                invalidPlaceholderColor: '{red.400}'
            },
            highlight: {
                background: 'color-mix(in srgb, {primary.500}, transparent 86%)',
                focusBackground: 'color-mix(in srgb, {primary.500}, transparent 76%)',
                color: '{primary.100}',
                focusColor: '{primary.50}'
            }
        }
    }
};

export const primeComponentTokens = {
    dataview: {
        root: {
            background: 'transparent',
            borderWidth: '0'
        },
        content: {
            background: 'transparent',
            borderWidth: '0'
        },
        header: {
            background: 'transparent',
            borderWidth: '0'
        }
    },
    dialog: {
        root: {
            background: '{content.background}',
            borderColor: '{content.border.color}',
            borderWidth: '1px',
            color: '{content.color}',
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        title: {
            fontSize: '1rem',
            fontWeight: '650'
        },
        header: {
            padding: '1.25rem 1.25rem 0.75rem'
        },
        content: {
            padding: '0 1.25rem 1.25rem'
        },
        footer: {
            padding: '0.75rem 1.25rem 1.25rem'
        }
    },
    panel: {
        root: {
            borderRadius: 'var(--ck-radius-panel)',
            borderColor: '{content.border.color}',
            borderWidth: '1px',
            background: '{content.background}',
            color: '{content.color}'
        },
        header: {
            background: '{content.hover.background}',
            padding: '1rem 1.125rem',
            borderColor: '{content.border.color}',
            borderWidth: '0 0 1px'
        },
        title: {
            fontWeight: '650'
        },
        content: {
            padding: '1.125rem'
        }
    },
    card: {
        root: {
            background: '{content.background}',
            color: '{text.color}',
            borderColor: '{content.border.color}',
            borderWidth: '1px',
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-card)'
        },
        body: {
            padding: '1rem',
            gap: '0.75rem'
        },
        title: {
            fontSize: '1rem',
            fontWeight: '650'
        },
        subtitle: {
            color: '{text.muted.color}'
        }
    },
    button: {
        root: {
            borderRadius: 'var(--ck-radius-ui)',
            gap: '0.375rem',
            paddingX: '0.75rem',
            paddingY: '0.5rem',
            iconOnlyWidth: '2.375rem',
            raisedShadow: 'none',
            label: {
                fontWeight: '700'
            },
            sm: {
                fontSize: '0.8125rem',
                paddingX: '0.625rem',
                paddingY: '0.375rem',
                iconOnlyWidth: '2rem'
            }
        }
    },
    tag: {
        root: {
            borderRadius: 'var(--ck-radius-ui)',
            fontWeight: '700',
            padding: '0.1875rem 0.5rem'
        }
    },
    chip: {
        root: {
            borderRadius: 'var(--ck-radius-ui)'
        }
    },
    menu: {
        root: {
            background: '{content.background}',
            borderColor: '{content.border.color}',
            color: '{content.color}',
            borderRadius: 'var(--ck-radius-panel)',
            shadow: 'var(--ck-shadow-overlay)'
        },
        list: {
            padding: '0.3125rem',
            gap: '0.125rem'
        },
        item: {
            focusBackground: '{content.hover.background}',
            color: '{text.color}',
            focusColor: '{text.color}',
            padding: '0.5rem 0.625rem',
            borderRadius: 'var(--ck-radius-ui)',
            gap: '0.5rem',
            icon: {
                color: '{text.muted.color}',
                focusColor: '{primary.color}'
            }
        },
        separator: {
            borderColor: '{content.border.color}'
        }
    },
    tabs: {
        root: {
            transitionDuration: 'var(--ck-motion-normal)'
        },
        tablist: {
            background: 'transparent',
            borderWidth: '0 0 1px',
            borderColor: '{content.border.color}'
        },
        tab: {
            background: 'transparent',
            hoverBackground: '{content.hover.background}',
            activeBackground: 'transparent',
            color: '{text.muted.color}',
            hoverColor: '{text.color}',
            activeColor: '{primary.color}',
            padding: '0.75rem 0.875rem',
            fontWeight: '700'
        },
        activeBar: {
            height: '3px',
            background: '{primary.color}'
        }
    },
    tabview: {
        root: {
            transitionDuration: 'var(--ck-motion-normal)'
        },
        tabList: {
            background: 'transparent',
            borderColor: '{content.border.color}'
        },
        tab: {
            borderColor: '{content.border.color}',
            activeBorderColor: '{primary.color}',
            color: '{text.muted.color}',
            hoverColor: '{text.color}',
            activeColor: '{primary.color}'
        },
        tabPanel: {
            background: 'transparent',
            color: '{text.color}'
        }
    },
    drawer: {
        root: {
            background: '{content.background}',
            borderColor: '{content.border.color}',
            color: '{content.color}',
            shadow: 'var(--ck-shadow-overlay)'
        },
        header: {
            padding: '1rem 1.125rem'
        },
        title: {
            fontSize: '1rem',
            fontWeight: '650'
        },
        content: {
            padding: '0 1.125rem 1.125rem'
        }
    },
    toast: {
        root: {
            borderRadius: 'var(--ck-radius-panel)',
            borderWidth: '1px',
            transitionDuration: 'var(--ck-motion-normal)'
        },
        content: {
            padding: '0.875rem 1rem'
        },
        summary: {
            fontWeight: '650'
        }
    },
    datatable: {
        root: {
            borderColor: '{content.border.color}'
        },
        headerCell: {
            borderColor: '{content.border.color}',
            color: '{text.muted.color}',
            padding: '0.75rem 1rem'
        },
        bodyCell: {
            borderColor: '{content.border.color}',
            padding: '0.75rem 1rem'
        },
        row: {
            color: '{text.color}'
        },
        columnTitle: {
            fontWeight: '700'
        },
        colorScheme: {
            light: {
                headerCell: {
                    background: '{surface.100}',
                    hoverBackground: '{surface.200}',
                    selectedBackground: '{primary.50}'
                },
                row: {
                    background: '{content.background}',
                    hoverBackground: '{surface.50}',
                    selectedBackground: '{primary.50}',
                    selectedColor: '{primary.900}'
                }
            },
            dark: {
                headerCell: {
                    background: '{surface.800}',
                    hoverBackground: '{surface.700}',
                    selectedBackground: 'color-mix(in srgb, {primary.500}, transparent 78%)'
                },
                row: {
                    background: '{content.background}',
                    hoverBackground: 'color-mix(in srgb, {surface.700}, transparent 58%)',
                    selectedBackground: 'color-mix(in srgb, {primary.500}, transparent 82%)',
                    selectedColor: '{primary.100}'
                }
            }
        }
    }
};
